import React, { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, FileText, Trash2, Users } from 'lucide-react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import { Modal } from '@/components/Modal/Modal';
import { TabPanel, Tabs, type TabItem } from '@/components/Tabs/Tabs';
import DetailsTab from './DetailsTab';
import TeamTab from './TeamTab';
import {
  TeamMeetingsList,
  type TeamMeetingsEditorState,
  type TeamMeetingsListProps,
} from '../TeamMeetings/TeamMeetingsList';
import { emailToDisplayName } from '@/features/app/utils/memberUtils';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import type { ApiProject, ApiProjectMember } from '@/lib/api';
import type { MemberOption } from './types';
import './EditProjectModal.scss';

export type EditProjectTab = 'details' | 'team' | 'meetings';

export interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ApiProject;
  projectMembers: ApiProjectMember[];
  /** Only class instructors and TAs may grant or revoke project admin. */
  canManageAdmins?: boolean;
  /** When false, only the admin-assignment section is editable (for class TAs). */
  canEditProjectDetails?: boolean;
  /** The team's Product Owner also gets the Meetings tab; nobody else sees it. */
  viewerIsProductOwner?: boolean;
  /**
   * The Meetings tab's list: the team's meetings and their handlers, which the project page shares
   * with its card. The tab adds `variant="manage"`, `canManage` and `onEditorChange`.
   */
  meetingsList?: Omit<TeamMeetingsListProps, 'variant' | 'canManage' | 'onEditorChange'>;
  /** The tab to open on (the project page's "Manage" and "Add one" open Meetings). @default 'details' */
  initialTab?: EditProjectTab;
  /** Called after a successful save so the parent can refetch project data. */
  onProjectChange?: () => void;
  onDelete?: () => void;
}

type TabId = EditProjectTab;

/** Someone who may only manage admins sees the Team tab alone, and only the Product Owner has Meetings. */
function openingTab(initialTab: TabId | undefined, canEditProjectDetails: boolean, viewerIsProductOwner: boolean): TabId {
  if (!canEditProjectDetails) return 'team';
  if (initialTab === 'meetings' && !viewerIsProductOwner) return 'details';
  return initialTab ?? 'details';
}

/** Who holds each project role according to a member list. */
interface RoleHolders {
  /** The person with role 'owner' (project creator) — read-only badge. */
  projectOwnerId: string | null;
  /** The Scrum 'product owner' role — assignable via dropdown. */
  productOwnerId: string | null;
  scrumMasterId: string | null;
  adminIds: Set<string>;
}

function roleHoldersOf(members: ApiProjectMember[]): RoleHolders {
  return {
    projectOwnerId: members.find((m) => m.project_role === 'owner')?.user_id ?? null,
    productOwnerId: members.find((m) => m.project_role === 'product owner')?.user_id ?? null,
    scrumMasterId: members.find((m) => m.project_role === 'scrum master')?.user_id ?? null,
    adminIds: new Set(members.filter((m) => m.project_role === 'admin').map((m) => m.user_id)),
  };
}

const EditProjectModal: React.FC<EditProjectModalProps> = ({
  isOpen,
  onClose,
  project,
  projectMembers,
  canManageAdmins = false,
  canEditProjectDetails = true,
  viewerIsProductOwner = false,
  meetingsList,
  initialTab,
  onProjectChange,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(() => openingTab(initialTab, canEditProjectDetails, viewerIsProductOwner));

  // ── Details fields ────────────────────────────────
  const [name, setName] = useState(project.name ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [teamSize, setTeamSize] = useState(String(project.team_size ?? ''));

  // ── Logo fields ───────────────────────────────────
  const [logoUrl, setLogoUrl] = useState<string | null>(project.image_url ?? null);
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);

  // ── Team role fields ──────────────────────────────
  // Role holders when the form was seeded: the owner badge, and the baseline
  // that Save diffs the dropdowns and admin toggles against.
  const [initialRoles, setInitialRoles] = useState(() => roleHoldersOf(projectMembers));
  const [productOwnerId, setProductOwnerId] = useState(initialRoles.productOwnerId);
  const [scrumMasterId, setScrumMasterId] = useState(initialRoles.scrumMasterId);
  const [adminIds, setAdminIds] = useState(() => new Set(initialRoles.adminIds));

  // ── UI state ──────────────────────────────────────
  const [nameError, setNameError] = useState<string | null>(null);
  const [teamSizeError, setTeamSizeError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  /** Why the last delete was refused, shown in the delete confirm. */
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const saveErrorRef = useRef<HTMLDivElement>(null);
  /** The Meetings tab's editor: a meeting with unsaved input, or a meeting request in flight. */
  const [meetingEditor, setMeetingEditor] = useState<TeamMeetingsEditorState>({ dirty: false, busy: false });
  const meetingHintId = useId();
  const tabsId = useId();

  // The modal stays mounted while closed, so reseed the form each time it opens,
  // and again if the project, its members or the caller's rights change while open.
  const [seededFrom, setSeededFrom] = useState({ isOpen, project, projectMembers, canEditProjectDetails });
  if (
    seededFrom.isOpen !== isOpen ||
    seededFrom.project !== project ||
    seededFrom.projectMembers !== projectMembers ||
    seededFrom.canEditProjectDetails !== canEditProjectDetails
  ) {
    setSeededFrom({ isOpen, project, projectMembers, canEditProjectDetails });
    if (isOpen) {
      setName(project.name ?? '');
      setDescription(project.description ?? '');
      setTeamSize(String(project.team_size ?? ''));
      setLogoUrl(project.image_url ?? null);
      setPendingLogoFile(null);
      setLogoPreview(null); // the cleanup effect below revokes the dropped preview URL
      setLogoRemoved(false);
      setNameError(null);
      setTeamSizeError(null);
      setApiError(null);
      setSaving(false);
      setActiveTab(openingTab(initialTab, canEditProjectDetails, viewerIsProductOwner));
      setShowDeleteConfirm(false);
      setDeleteError(null);

      const roles = roleHoldersOf(projectMembers);
      setInitialRoles(roles);
      setProductOwnerId(roles.productOwnerId);
      setScrumMasterId(roles.scrumMasterId);
      setAdminIds(new Set(roles.adminIds));
    }
  }

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  // A refused save shows above the actions, at the end of the body: scrolled into view, wherever the body is.
  useEffect(() => {
    if (apiError) saveErrorRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [apiError]);

  const toggleAdmin = (userId: string) => {
    setAdminIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleLogoFileChange = (file: File | null) => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    if (file) {
      setPendingLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
      setLogoRemoved(false);
    } else {
      setPendingLogoFile(null);
      setLogoPreview(null);
    }
  };

  const handleRemoveLogo = () => {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setPendingLogoFile(null);
    setLogoPreview(null);
    setLogoUrl(null);
    setLogoRemoved(true);
  };

  const handleSave = async () => {
    setNameError(null);
    setTeamSizeError(null);
    setApiError(null);

    // Details validation only applies when the caller may edit project fields.
    if (canEditProjectDetails) {
      if (!name.trim()) {
        setNameError('Project name is required');
        setActiveTab('details');
        return;
      }

      const teamSizeNum = parseInt(teamSize.trim(), 10);
      if (!Number.isFinite(teamSizeNum) || teamSizeNum < 1) {
        setTeamSizeError('Team size must be a number greater than 0');
        setActiveTab('details');
        return;
      }
    }

    setSaving(true);
    try {
      const projectId = project.id;
      let resolvedLogoUrl: string | null = logoUrl;

      if (canEditProjectDetails && pendingLogoFile) {
        const ext = pendingLogoFile.name.split('.').pop() ?? 'jpg';
        const path = `${projectId}/logo.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('project')
          .upload(path, pendingLogoFile, { upsert: true, contentType: pendingLogoFile.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('project').getPublicUrl(path);
        resolvedLogoUrl = urlData.publicUrl;
      } else if (canEditProjectDetails && logoRemoved) {
        resolvedLogoUrl = null;
      }

      if (canEditProjectDetails) {
        const teamSizeNum = parseInt(teamSize.trim(), 10);
        const trimmedName = name.trim();
        const nameChanged = trimmedName !== project.name;
        const descriptionChanged = description !== (project.description ?? '');
        const teamSizeChanged = teamSizeNum !== project.team_size;
        const logoChanged =
          logoRemoved ||
          pendingLogoFile !== null ||
          resolvedLogoUrl !== (project.image_url ?? null);

        if (nameChanged || descriptionChanged || teamSizeChanged || logoChanged) {
          await api.updateProject(projectId, {
            name: trimmedName,
            description,
            team_size: teamSizeNum,
            ...(logoChanged ? { image_url: resolvedLogoUrl ?? '' } : {}),
          });
          if (logoPreview) URL.revokeObjectURL(logoPreview);
          setLogoPreview(null);
          setPendingLogoFile(null);
          setLogoRemoved(false);
        }

        // 2. Product Owner: assign new or remove if cleared
        if (productOwnerId !== initialRoles.productOwnerId) {
          if (productOwnerId) {
            await api.assignProductOwner(projectId, productOwnerId);
          } else if (initialRoles.productOwnerId) {
            await api.removeProductOwner(projectId, initialRoles.productOwnerId);
          }
        }

        // 3. Scrum Master: assign new or remove if cleared
        if (scrumMasterId !== initialRoles.scrumMasterId) {
          if (scrumMasterId) {
            await api.assignScrumMaster(projectId, scrumMasterId);
          } else if (initialRoles.scrumMasterId) {
            await api.removeScrumMaster(projectId, initialRoles.scrumMasterId);
          }
        }
      }

      // 4. Admin: only instructors / TAs may change admin assignments
      if (canManageAdmins) {
        const initialAdmins = initialRoles.adminIds;
        const addedAdmins = [...adminIds].filter((id) => !initialAdmins.has(id));
        const removedAdmins = [...initialAdmins].filter((id) => !adminIds.has(id));
        await Promise.all([
          ...addedAdmins.map((id) => api.assignAdmin(projectId, id)),
          ...removedAdmins.map((id) => api.removeAdmin(projectId, id)),
        ]);
      }

      onProjectChange?.();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const askToDelete = () => {
    setDeleteError(null);
    setShowDeleteConfirm(true);
  };

  // The delete confirm is busy while this runs; a refusal stays in it, with the API's reason.
  const handleDelete = async () => {
    setDeleteError(null);
    try {
      await api.deleteProject(project.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete project');
      return;
    }
    setShowDeleteConfirm(false);
    onDelete?.();
    onClose();
  };

  // Edits on Details or Team that only Save Changes sends: the fields against what they were seeded
  // with. While there are any, the Meetings tab keeps Cancel / Save Changes, so they are never dropped
  // by a Done that looks like it saves everything.
  const hasStagedEdits =
    name !== (project.name ?? '') ||
    description !== (project.description ?? '') ||
    teamSize !== String(project.team_size ?? '') ||
    pendingLogoFile !== null ||
    logoRemoved ||
    productOwnerId !== initialRoles.productOwnerId ||
    scrumMasterId !== initialRoles.scrumMasterId ||
    adminIds.size !== initialRoles.adminIds.size ||
    [...adminIds].some((id) => !initialRoles.adminIds.has(id));
  // Done and Save Changes would close the modal on a meeting that is unsaved, or still saving (its
  // error would have nowhere to show), so they wait for it. The X, the backdrop, Cancel and Escape
  // still dismiss.
  const meetingHolds = meetingEditor.dirty || meetingEditor.busy;
  const meetingHint = meetingEditor.dirty ? meetingHintId : undefined;

  const memberOptions: MemberOption[] = projectMembers.map((m) => ({
    userId: m.user_id,
    displayName: emailToDisplayName(m.email),
    email: m.email ?? '',
    projectRole: m.project_role,
  }));

  // Only the team's Product Owner has the Meetings tab.
  const tabItems: TabItem<TabId>[] = [
    { value: 'details', label: 'Details', icon: <FileText size={16} aria-hidden="true" /> },
    { value: 'team', label: 'Team', icon: <Users size={16} aria-hidden="true" /> },
    ...(viewerIsProductOwner
      ? [{ value: 'meetings' as const, label: 'Meetings', icon: <CalendarDays size={16} aria-hidden="true" /> }]
      : []),
  ];
  const teamTab = (
    <TeamTab
      memberOptions={memberOptions}
      projectOwnerId={initialRoles.projectOwnerId}
      productOwnerId={productOwnerId}
      onProductOwnerChange={setProductOwnerId}
      scrumMasterId={scrumMasterId}
      onScrumMasterChange={setScrumMasterId}
      adminIds={adminIds}
      onToggleAdmin={toggleAdmin}
      canManageAdmins={canManageAdmins}
      canEditProjectDetails={canEditProjectDetails}
    />
  );

  return (
    <>
      <Modal
        open={isOpen}
        onClose={onClose}
        size="lg"
        className="edit-project"
        title={canEditProjectDetails ? 'Edit Project' : 'Manage Project Admins'}
        subtitle={
          canEditProjectDetails
            ? 'Manage your project configuration and team roles'
            : 'Assign or revoke admin access for project members'
        }
        // Saving holds the modal open: the ×, Esc and the backdrop wait for the answer.
        closeDisabled={saving}
        tabs={
          canEditProjectDetails && (
            <Tabs
              idBase={tabsId}
              ariaLabel="Edit project sections"
              tabs={tabItems}
              value={activeTab}
              onChange={setActiveTab}
              collapseOnPhone
            />
          )
        }
        footer={
          <div className={`edit-project__footer ${meetingEditor.dirty ? 'edit-project__footer--hint' : ''}`}>
            {canEditProjectDetails && (
              <Button
                variant="danger-ghost"
                className="edit-project__delete"
                iconLeft={<Trash2 size={16} />}
                onClick={askToDelete}
                disabled={saving}
              >
                Delete Project
              </Button>
            )}
            <div className="edit-project__footer-right">
              {meetingEditor.dirty && (
                <p id={meetingHintId} className="edit-project__footer-hint">
                  Save or cancel the meeting you're editing first.
                </p>
              )}
              {activeTab === 'meetings' && !hasStagedEdits ? (
                // Each meeting saves on its own, so with nothing staged elsewhere Done just closes.
                <Button onClick={onClose} disabled={saving || meetingHolds} aria-describedby={meetingHint}>
                  Done
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={onClose} disabled={saving}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    loading={saving}
                    loadingLabel="Saving…"
                    disabled={meetingHolds}
                    aria-describedby={meetingHint}
                  >
                    Save Changes
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {canEditProjectDetails ? (
          <>
            {/* Details and Team keep their edits in this modal's state, so their panels can unmount. */}
            <TabPanel idBase={tabsId} value="details" active={activeTab === 'details'}>
              <DetailsTab
                name={name}
                onNameChange={setName}
                nameError={nameError}
                description={description}
                onDescriptionChange={setDescription}
                teamSize={teamSize}
                onTeamSizeChange={setTeamSize}
                teamSizeError={teamSizeError}
                logoPreview={logoPreview}
                logoUrl={logoUrl}
                onLogoFileChange={handleLogoFileChange}
                onRemoveLogo={handleRemoveLogo}
              />
            </TabPanel>
            <TabPanel idBase={tabsId} value="team" active={activeTab === 'team'}>
              {teamTab}
            </TabPanel>
            {viewerIsProductOwner && (
              // Mounted behind the other tabs, so a meeting draft survives a tab switch as Details and
              // Team edits do.
              <TabPanel idBase={tabsId} value="meetings" active={activeTab === 'meetings'} keepMounted>
                <TeamMeetingsList variant="manage" canManage {...meetingsList} onEditorChange={setMeetingEditor} />
              </TabPanel>
            )}
          </>
        ) : (
          // Someone who only manages admins sees the Team content alone, with no tab strip.
          teamTab
        )}
        {apiError && (
          <Alert tone="error" className="edit-project__save-error" ref={saveErrorRef}>
            {apiError}
          </Alert>
        )}
      </Modal>

      <ConfirmDialog
        open={isOpen && showDeleteConfirm}
        destructive
        title="Delete project?"
        message={`This will permanently delete "${project.name}" and remove all members. This action cannot be undone.`}
        confirmLabel="Delete Project"
        busyLabel="Deleting…"
        error={deleteError}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
      />
    </>
  );
};

export default EditProjectModal;

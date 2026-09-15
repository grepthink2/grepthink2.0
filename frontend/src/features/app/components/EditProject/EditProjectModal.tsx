import React, { useEffect, useState } from 'react';
import { Settings, Trash2, Users, X } from 'lucide-react';
import ConfirmModal from '../Overlays/ConfirmModal';
import DetailsTab from './DetailsTab';
import TeamTab from './TeamTab';
import { emailToDisplayName } from '@/features/app/utils/memberUtils';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabaseClient';
import type { ApiProject, ApiProjectMember } from '@/lib/api';
import type { MemberOption } from './types';
import './EditProjectModal.scss';

export interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ApiProject;
  projectMembers: ApiProjectMember[];
  /** Only class instructors and TAs may grant or revoke project admin. */
  canManageAdmins?: boolean;
  /** When false, only the admin-assignment section is editable (for class TAs). */
  canEditProjectDetails?: boolean;
  /** Called after a successful save so the parent can refetch project data. */
  onProjectChange?: () => void;
  onDelete?: () => void;
}

type TabId = 'details' | 'team';

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
  onProjectChange,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>(canEditProjectDetails ? 'details' : 'team');

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
      setActiveTab(canEditProjectDetails ? 'details' : 'team');
      setShowDeleteConfirm(false);

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

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

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

  const handleDelete = async () => {
    setApiError(null);
    setSaving(true);
    try {
      await api.deleteProject(project.id);
      onDelete?.();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const memberOptions: MemberOption[] = projectMembers.map((m) => ({
    userId: m.user_id,
    displayName: emailToDisplayName(m.email),
    email: m.email ?? '',
    projectRole: m.project_role,
  }));

  return (
    <>
      <div className="edit-project-backdrop" onClick={onClose}>
        <div className="edit-project" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="edit-project__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={24} />
          </button>

          <header className="edit-project__header">
            <h2 className="edit-project__title">
              {canEditProjectDetails ? 'Edit Project' : 'Manage Project Admins'}
            </h2>
            <p className="edit-project__subtitle">
              {canEditProjectDetails
                ? 'Manage your project configuration and team roles'
                : 'Assign or revoke admin access for project members'}
            </p>
          </header>

          {/* ── Tabs ── */}
          {canEditProjectDetails && (
            <div className="edit-project__tabs">
              <button
                type="button"
                className={`edit-project__tab ${activeTab === 'details' ? 'edit-project__tab--active' : ''}`}
                onClick={() => setActiveTab('details')}
              >
                <Settings size={16} />
                <span>Details</span>
              </button>
              <button
                type="button"
                className={`edit-project__tab ${activeTab === 'team' ? 'edit-project__tab--active' : ''}`}
                onClick={() => setActiveTab('team')}
              >
                <Users size={16} />
                <span>Team</span>
              </button>
            </div>
          )}

          {/* ── Body ── */}
          <div className="edit-project__body">
            {apiError && (
              <p className="edit-project__api-error" role="alert">{apiError}</p>
            )}
            {activeTab === 'details' && (
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
            )}
            {(activeTab === 'team' || !canEditProjectDetails) && (
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
            )}
          </div>

          {/* ── Footer ── */}
          <footer className="edit-project__footer">
            {canEditProjectDetails && (
              <button
                type="button"
                className="edit-project__btn edit-project__btn--delete"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={saving}
              >
                <Trash2 size={16} />
                Delete Project
              </button>
            )}
            <div className="edit-project__footer-right">
              <button
                type="button"
                className="edit-project__btn edit-project__btn--secondary"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="edit-project__btn edit-project__btn--save"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </footer>
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          handleDelete();
        }}
        title="Delete project?"
        message={`This will permanently delete "${project.name}" and remove all members. This action cannot be undone.`}
        confirmText="Delete Project"
        cancelText="Cancel"
      />
    </>
  );
};

export default EditProjectModal;

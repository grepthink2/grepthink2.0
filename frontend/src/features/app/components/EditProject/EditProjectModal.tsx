import React, { useEffect, useRef, useState } from 'react';
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
  const [activeTab, setActiveTab] = useState<TabId>('details');

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
  // projectOwnerId: the person with role 'owner' (project creator) — read-only badge
  const [projectOwnerId, setProjectOwnerId] = useState<string | null>(null);
  // productOwnerId: the Scrum 'product owner' role — assignable via dropdown
  const [productOwnerId, setProductOwnerId] = useState<string | null>(null);
  const [scrumMasterId, setScrumMasterId] = useState<string | null>(null);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());

  // ── Initial values for dirty-checking on save ────
  const initialProductOwnerIdRef = useRef<string | null>(null);
  const initialScrumMasterIdRef = useRef<string | null>(null);
  const initialAdminIdsRef = useRef<Set<string>>(new Set());

  // ── UI state ──────────────────────────────────────
  const [nameError, setNameError] = useState<string | null>(null);
  const [teamSizeError, setTeamSizeError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(project.name ?? '');
    setDescription(project.description ?? '');
    setTeamSize(String(project.team_size ?? ''));
    setLogoUrl(project.image_url ?? null);
    setPendingLogoFile(null);
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoPreview(null);
    setLogoRemoved(false);
    setNameError(null);
    setTeamSizeError(null);
    setApiError(null);
    setSaving(false);
    setActiveTab(canEditProjectDetails ? 'details' : 'team');
    setShowDeleteConfirm(false);

    // Seed role state from current member list
    const ownerMember = projectMembers.find((m) => m.project_role === 'owner');
    const productOwnerMember = projectMembers.find((m) => m.project_role === 'product owner');
    const scrumMasterMember = projectMembers.find((m) => m.project_role === 'scrum master');
    const adminMembers = projectMembers.filter((m) => m.project_role === 'admin');

    setProjectOwnerId(ownerMember?.user_id ?? null);
    setProductOwnerId(productOwnerMember?.user_id ?? null);
    setScrumMasterId(scrumMasterMember?.user_id ?? null);
    const initialAdmins = new Set(adminMembers.map((m) => m.user_id));
    setAdminIds(initialAdmins);

    // Snapshot initial values for diffing on save
    initialProductOwnerIdRef.current = productOwnerMember?.user_id ?? null;
    initialScrumMasterIdRef.current = scrumMasterMember?.user_id ?? null;
    initialAdminIdsRef.current = new Set(initialAdmins);
  }, [isOpen, project, projectMembers, canEditProjectDetails]);

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
        if (productOwnerId !== initialProductOwnerIdRef.current) {
          if (productOwnerId) {
            await api.assignProductOwner(projectId, productOwnerId);
          } else if (initialProductOwnerIdRef.current) {
            await api.removeProductOwner(projectId, initialProductOwnerIdRef.current);
          }
        }

        // 3. Scrum Master: assign new or remove if cleared
        if (scrumMasterId !== initialScrumMasterIdRef.current) {
          if (scrumMasterId) {
            await api.assignScrumMaster(projectId, scrumMasterId);
          } else if (initialScrumMasterIdRef.current) {
            await api.removeScrumMaster(projectId, initialScrumMasterIdRef.current);
          }
        }
      }

      // 4. Admin: only instructors / TAs may change admin assignments
      if (canManageAdmins) {
        const initialAdmins = initialAdminIdsRef.current;
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
                projectOwnerId={projectOwnerId}
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

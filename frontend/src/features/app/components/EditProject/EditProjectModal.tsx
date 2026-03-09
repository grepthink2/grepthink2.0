import React, { useEffect, useRef, useState } from 'react';
import { Settings, Trash2, Users, X } from 'lucide-react';
import ConfirmModal from '../Overlays/ConfirmModal';
import DetailsTab from './DetailsTab';
import TeamTab from './TeamTab';
import { emailToDisplayName } from '@/features/app/utils/memberUtils';
import { api } from '@/lib/api';
import type { ApiProject, ApiProjectMember } from '@/lib/api';
import type { MemberOption } from './types';
import './EditProjectModal.scss';

export interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ApiProject;
  projectMembers: ApiProjectMember[];
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
  onProjectChange,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('details');

  // ── Details fields ────────────────────────────────
  const [name, setName] = useState(project.name ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [teamSize, setTeamSize] = useState(String(project.team_size ?? ''));

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
    setNameError(null);
    setTeamSizeError(null);
    setApiError(null);
    setSaving(false);
    setActiveTab('details');
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
  }, [isOpen, project, projectMembers]);

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

  const handleSave = async () => {
    setNameError(null);
    setTeamSizeError(null);
    setApiError(null);

    // Validate name (field visible but not saved yet — still required to be non-empty)
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

    setSaving(true);
    try {
      const projectId = project.id;

      // 1. Update description / team size if changed
      const descriptionChanged = description !== (project.description ?? '');
      const teamSizeChanged = teamSizeNum !== project.team_size;
      if (descriptionChanged || teamSizeChanged) {
        await api.updateProject(projectId, {
          ...(descriptionChanged ? { description } : {}),
          ...(teamSizeChanged ? { team_size: teamSizeNum } : {}),
        });
      }

      // 2. Product Owner: assign new or remove if cleared
      if (productOwnerId !== initialProductOwnerIdRef.current) {
        if (productOwnerId) {
          // assignProductOwner auto-demotes the previous holder
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

      // 4. Admin: diff the Sets to find adds and removes
      const initialAdmins = initialAdminIdsRef.current;
      const addedAdmins = [...adminIds].filter((id) => !initialAdmins.has(id));
      const removedAdmins = [...initialAdmins].filter((id) => !adminIds.has(id));
      await Promise.all([
        ...addedAdmins.map((id) => api.assignAdmin(projectId, id)),
        ...removedAdmins.map((id) => api.removeAdmin(projectId, id)),
      ]);

      onProjectChange?.();
      onClose();
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to save changes');
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
            <h2 className="edit-project__title">Edit Project</h2>
            <p className="edit-project__subtitle">
              Manage your project configuration and team roles
            </p>
          </header>

          {/* ── Tabs ── */}
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
              />
            )}
            {activeTab === 'team' && (
              <TeamTab
                memberOptions={memberOptions}
                projectOwnerId={projectOwnerId}
                productOwnerId={productOwnerId}
                onProductOwnerChange={setProductOwnerId}
                scrumMasterId={scrumMasterId}
                onScrumMasterChange={setScrumMasterId}
                adminIds={adminIds}
                onToggleAdmin={toggleAdmin}
              />
            )}
          </div>

          {/* ── Footer ── */}
          <footer className="edit-project__footer">
            <button
              type="button"
              className="edit-project__btn edit-project__btn--delete"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={saving}
            >
              <Trash2 size={16} />
              Delete Project
            </button>
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
          onDelete?.();
          onClose();
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

import React, { useEffect, useState } from 'react';
import { Settings, Trash2, Users, X } from 'lucide-react';
import ConfirmModal from '../Overlays/ConfirmModal';
import DetailsTab from './DetailsTab';
import TeamTab from './TeamTab';
import { emailToDisplayName } from '@/features/app/utils/memberUtils';
import type { ApiProject, ApiProjectMember } from '@/lib/api';
import type { EditProjectFormData, MemberOption } from './types';
import './EditProjectModal.scss';

export type { EditProjectFormData };

export interface EditProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ApiProject;
  projectMembers: ApiProjectMember[];
  onSave?: (data: EditProjectFormData) => void;
  onDelete?: () => void;
}

type TabId = 'details' | 'team';

const EditProjectModal: React.FC<EditProjectModalProps> = ({
  isOpen,
  onClose,
  project,
  projectMembers,
  onSave,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('details');
  const [name, setName] = useState(project.name ?? '');
  const [description, setDescription] = useState(project.description ?? '');
  const [teamSize, setTeamSize] = useState(String(project.team_size ?? ''));
  const [productOwnerId, setProductOwnerId] = useState<string | null>(null);
  const [scrumMasterId, setScrumMasterId] = useState<string | null>(null);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [nameError, setNameError] = useState<string | null>(null);
  const [teamSizeError, setTeamSizeError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(project.name ?? '');
    setDescription(project.description ?? '');
    setTeamSize(String(project.team_size ?? ''));
    setNameError(null);
    setTeamSizeError(null);
    setActiveTab('details');
    setShowDeleteConfirm(false);

    const owner = projectMembers.find((m) => m.project_role === 'owner');
    const scrumMaster = projectMembers.find((m) => m.project_role === 'scrum_master');
    const admins = projectMembers.filter((m) => m.project_role === 'admin');
    setProductOwnerId(owner?.user_id ?? null);
    setScrumMasterId(scrumMaster?.user_id ?? null);
    setAdminIds(new Set(admins.map((m) => m.user_id)));
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

  const handleSave = () => {
    setNameError(null);
    setTeamSizeError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
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

    onSave?.({ name: trimmedName, description, teamSize, productOwnerId, scrumMasterId, adminIds });
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
            >
              <Trash2 size={16} />
              Delete Project
            </button>
            <div className="edit-project__footer-right">
              <button
                type="button"
                className="edit-project__btn edit-project__btn--secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="edit-project__btn edit-project__btn--save"
                onClick={handleSave}
              >
                Save Changes
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

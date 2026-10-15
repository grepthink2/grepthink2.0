import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import {
  Brush,
  Check,
  ChevronDown,
  Code,
  Database,
  LogOut,
  MonitorCog,
  MonitorSmartphone,
  SquarePen,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import './ProjectView.scss';
import { useAuth } from '@/lib/auth';
import { useClass, useClassRole } from '@/lib/classContext';
import MarkdownText from '@/components/Markdown/MarkdownText';
import { Menu, MenuItem } from '@/components/Menu/Menu';
import { Popover } from '@/components/Popover/Popover';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import ProjectMembersPopover from './ProjectMembersPopover';
import SprintProgressCard from './SprintProgressCard';
import type { ProjectMember } from './projectMembers';
import RequestModal from './RequestModal';
import MemberManagerModal from './MemberManagerModal';
import EditProjectModal from '../EditProject/EditProjectModal';
import ConfirmModal from '../Overlays/ConfirmModal';
import { api } from '@/lib/api';
import type { ApiProject, ApiProjectMember, ApiProjectTA } from '@/lib/api';
import { getMemberCopyEmail } from '@/features/app/utils/memberUtils';

/** Stacks skeleton rows with the cards' inner rhythm. */
const SKELETON_STACK: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--gt-space-sm)' };

/**
 * Loading placeholder for the project page. It uses the page's own cards and class names, so the
 * skeleton and the loaded page share their geometry.
 */
export const ProjectViewSkeleton: React.FC = () => (
  <div className="project-view" aria-busy="true">
    <div className="project-view__card project-view__header">
      <div className="project-view__header-content">
        <div className="project-view__header-left">
          <div className="project-view__title">
            <Skeleton width={260} height={28} />
          </div>
          <div className="project-view__class-name">
            <Skeleton width={120} height={14} />
          </div>
          <div className="project-view__stats">
            <Skeleton width={110} height={20} />
          </div>
          <div className="project-view__divider" />
          <div className="project-view__skills-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width={70} height={24} />
            ))}
          </div>
        </div>
      </div>
    </div>
    <div className="project-view__content">
      <div className="project-view__card project-view__description" style={SKELETON_STACK}>
        <Skeleton width="90%" height={14} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="95%" height={14} />
        <Skeleton width="60%" height={14} />
      </div>
      <div className="project-view__aside">
        <div className="project-view__card" style={SKELETON_STACK}>
          <Skeleton width={120} height={18} />
          <Skeleton width={180} height={14} />
          <div style={{ display: 'flex', gap: 'var(--gt-space-sm)' }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} width={56} height={40} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

/** Roles that can manage the project (add/drop members, edit project). */
const MANAGER_ROLES = ['owner', 'admin', 'product owner'] as const;

/** "3 spots available", "1 spot available", or "Team full" once nobody else fits. */
function spotsText(spots: number): string {
  if (spots <= 0) return 'Team full';
  return spots === 1 ? '1 spot available' : `${spots} spots available`;
}

function getRoleIcon(roleId: string) {
  switch (roleId) {
    case 'designer':
      return <Brush size={18} />;
    case 'frontend':
      return <MonitorSmartphone size={18} />;
    case 'backend':
      return <MonitorCog size={18} />;
    case 'database':
      return <Database size={18} />;
    default:
      return <Code size={18} />;
  }
}

function getRoleLabel(roleId: string) {
  switch (roleId) {
    case 'designer':
      return 'Designer';
    case 'frontend':
      return 'Frontend Developer';
    case 'backend':
      return 'Backend Engineer';
    case 'database':
      return 'Database';
    default:
      return roleId;
  }
}

interface ProjectViewProps {
  projectId?: string;
  projectTitle: string;
  teamSize?: string;
  /** The project's class, shown under the title when known. */
  className?: string;
  descriptionMarkdown: string;
  skills: string[];
  selectedRoles: string[];
  /** The team as the header's members panel lists it. */
  members?: ProjectMember[];
  /** TAs assigned to oversee this project; the members panel lists them apart from the team. */
  tas?: ApiProjectTA[];
  /** Current user's role on this project (from API). Enables owner/admin to see management buttons. */
  userRoleOnProject?: string | null;
  /** Required for Team Management modal (Add/Drop Members). */
  classId?: string;
  /** Full project from API (for team_size, etc.). Required when classId is set. */
  project?: ApiProject | null;
  /** Raw project members from API. Required when classId is set. */
  projectMembers?: ApiProjectMember[];
  /** Called after member/request changes so parent can refetch. */
  onMembersChange?: () => void;
  /** Called after the project is successfully deleted so the parent can navigate away. */
  onDelete?: () => void;
  /** Called when the current user (student) leaves the project. */
  onLeave?: () => void;
  /** request_id of the current user's pending join request, if any. */
  pendingRequestId?: string | null;
  /** Called after a join request is successfully sent, with its request_id. */
  onRequestSent?: (requestId: string) => void;
  /** Called after the pending join request is cancelled. */
  onRequestCancelled?: () => void;
}

const ProjectView: React.FC<ProjectViewProps> = ({
  projectId,
  projectTitle,
  teamSize: teamSizeInput = '',
  className = '',
  descriptionMarkdown,
  skills,
  selectedRoles,
  members = [],
  tas = [],
  userRoleOnProject,
  classId,
  project,
  projectMembers = [],
  onMembersChange,
  onDelete,
  onLeave,
  pendingRequestId = null,
  onRequestSent,
  onRequestCancelled,
}) => {
  const { user } = useAuth();
  const { selectedClass } = useClass();
  const rolesId = useId();
  // Your role in the project's class. The Create Project preview has no class yet: the project
  // goes to the selected class.
  const classRole = useClassRole(classId ?? selectedClass?.id);
  const isInstructor = classRole === 'instructor';
  const canManageProject =
    isInstructor ||
    (userRoleOnProject != null && MANAGER_ROLES.includes(userRoleOnProject as (typeof MANAGER_ROLES)[number]));
  // The creator of a project nobody is left in may delete it (they left the team or moved to
  // another one); the backend also requires that they are still enrolled in the class.
  const canDeleteEmptyProject =
    !canManageProject &&
    Boolean(projectId && project && user?.id) &&
    project?.created_by === user?.id &&
    projectMembers.length === 0;
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestedHovered, setRequestedHovered] = useState(false);
  const [cancellingRequest, setCancellingRequest] = useState(false);
  const [memberManagerOpen, setMemberManagerOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [joinedOpen, setJoinedOpen] = useState(false);
  const joinedButtonRef = useRef<HTMLButtonElement>(null);

  // Esc, a click outside and "Leave project" all close the Joined menu here. Focus on its item
  // would go down with it, so it goes back to the Joined button, without scrolling: after a click
  // outside, the browser then moves it to whatever was clicked. Stable, so Popover keeps its listeners.
  const closeJoined = useCallback(() => {
    if (document.activeElement?.closest('.project-view__joined-menu')) {
      joinedButtonRef.current?.focus({ preventScroll: true });
    }
    setJoinedOpen(false);
  }, []);

  // What the members panel's "Copy all emails" writes: each member's roster (edu) email first.
  const copyEmails = useMemo(
    () => projectMembers.map(getMemberCopyEmail).filter((email): email is string => Boolean(email)),
    [projectMembers],
  );

  // The class instructor and class TAs may manage project admins.
  const canManageAdmins = Boolean(classId) && (classRole === 'instructor' || classRole === 'ta');

  const handleCancelRequest = useCallback(async () => {
    if (!pendingRequestId || cancellingRequest) return;
    setCancellingRequest(true);
    try {
      await api.cancelJoinRequest(pendingRequestId);
      onRequestCancelled?.();
    } catch {
      // stay in requested state on failure
    } finally {
      setCancellingRequest(false);
      setRequestedHovered(false);
    }
  }, [pendingRequestId, cancellingRequest, onRequestCancelled]);

  const handleDeleteEmptyProject = async () => {
    if (!projectId || deletingProject) return;
    setDeletingProject(true);
    setDeleteError(null);
    try {
      await api.deleteProject(projectId);
      onDelete?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete project');
    } finally {
      setDeletingProject(false);
    }
  };

  const displayTitle = projectTitle.trim() ? projectTitle : 'Project Title';
  const totalMembers = parseInt(teamSizeInput.trim(), 10);
  const hasValidTeamSize = !isNaN(totalMembers) && totalMembers >= 1;
  const spotsAvailable = hasValidTeamSize ? totalMembers - members.length : null;
  // The sprint card needs a project and the roles card a role. The Create Project preview starts
  // with neither, and then the description takes the whole row.
  const hasAside = Boolean(projectId) || selectedRoles.length > 0;

  return (
    <div className="project-view">
      <header className="project-view__card project-view__header">
        <div className="project-view__header-content">
          <div className="project-view__header-left">
            <h1 className="project-view__title">{displayTitle}</h1>
            {className && <p className="project-view__class-name">{className}</p>}
            <div className="project-view__stats">
              <ProjectMembersPopover
                members={members}
                tas={tas}
                teamSize={hasValidTeamSize ? totalMembers : null}
                copyEmails={copyEmails}
                currentUserId={user?.id}
              />
              {spotsAvailable !== null && <span className="project-view__stat">{spotsText(spotsAvailable)}</span>}
            </div>
            {skills.length > 0 && (
              <>
                <div className="project-view__divider" />
                <div className="project-view__looking-for">
                  <Code size={16} aria-hidden="true" />
                  <span>Looking for:</span>
                  <div className="project-view__skills-list">
                    {skills.map((skill) => (
                      <span key={skill} className="project-view__skill-tag">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="project-view__header-right">
            {canManageProject ? (
              <div className="project-view__instructor-actions">
                <button
                  type="button"
                  className="project-view__request-button"
                  onClick={() => projectId && project && classId && setMemberManagerOpen(true)}
                  disabled={!projectId || !project || !classId}
                >
                  <UserPlus size={18} />
                  Add/Drop Members
                </button>
                <button
                  type="button"
                  className="project-view__request-button"
                  onClick={() => projectId && project && setEditProjectOpen(true)}
                  disabled={!projectId || !project}
                >
                  <SquarePen size={18} />
                  Edit Project/Roles
                </button>
              </div>
            ) : canManageAdmins ? (
              <button
                type="button"
                className="project-view__request-button"
                onClick={() => projectId && project && setEditProjectOpen(true)}
                disabled={!projectId || !project}
              >
                <SquarePen size={18} />
                Manage Admins
              </button>
            ) : userRoleOnProject != null && userRoleOnProject !== '' ? (
              <Popover
                open={joinedOpen}
                onClose={closeJoined}
                align="end"
                padded={false}
                anchor={
                  <button
                    ref={joinedButtonRef}
                    type="button"
                    className="project-view__request-button project-view__joined-btn"
                    aria-haspopup="menu"
                    aria-expanded={joinedOpen}
                    onClick={() => setJoinedOpen((o) => !o)}
                  >
                    <Users size={18} />
                    Joined
                    <ChevronDown size={16} />
                  </button>
                }
              >
                <Menu
                  ariaLabel="Project membership"
                  autoFocus
                  onClose={closeJoined}
                  className="project-view__joined-menu"
                >
                  <MenuItem
                    destructive
                    icon={<LogOut size={15} aria-hidden="true" />}
                    onSelect={() => {
                      closeJoined();
                      onLeave?.();
                    }}
                  >
                    Leave project
                  </MenuItem>
                </Menu>
              </Popover>
            ) : pendingRequestId ? (
              <button
                type="button"
                className={`project-view__request-button project-view__request-button--requested${requestedHovered ? ' project-view__request-button--unsend' : ''}`}
                disabled={cancellingRequest}
                onMouseEnter={() => setRequestedHovered(true)}
                onMouseLeave={() => setRequestedHovered(false)}
                onClick={() => void handleCancelRequest()}
              >
                {cancellingRequest ? (
                  'Cancelling…'
                ) : requestedHovered ? (
                  <>
                    <X size={18} />
                    Unsend
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Requested
                  </>
                )}
              </button>
            ) : canDeleteEmptyProject ? (
              <div className="project-view__instructor-actions">
                <button
                  type="button"
                  className="project-view__request-button"
                  onClick={() => setRequestModalOpen(true)}
                >
                  <UserPlus size={18} />
                  Request to Join
                </button>
                <button
                  type="button"
                  className="project-view__request-button project-view__request-button--danger"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={deletingProject}
                >
                  <Trash2 size={18} />
                  {deletingProject ? 'Deleting…' : 'Delete Project'}
                </button>
                {deleteError && (
                  <p className="project-view__action-error" role="alert">
                    {deleteError}
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="project-view__request-button"
                onClick={() => setRequestModalOpen(true)}
              >
                <UserPlus size={18} />
                Request to Join
              </button>
            )}
          </div>
        </div>
      </header>

      <div className={`project-view__content${hasAside ? '' : ' project-view__content--single'}`}>
        <section className="project-view__card project-view__description" aria-label="Project description">
          {descriptionMarkdown.trim() ? (
            <MarkdownText variant="document">{descriptionMarkdown}</MarkdownText>
          ) : (
            <p className="project-view__muted">No description yet.</p>
          )}
        </section>

        {hasAside && (
          <div className="project-view__aside">
            {projectId && <SprintProgressCard key={projectId} projectId={projectId} projectName={displayTitle} />}
            {selectedRoles.length > 0 && (
              <section className="project-view__card project-view__roles" aria-labelledby={rolesId}>
                <h3 id={rolesId} className="project-view__section-title">
                  Roles needed
                </h3>
                <ul className="project-view__roles-list">
                  {selectedRoles.map((roleId) => (
                    <li key={roleId} className="project-view__role-item">
                      <span className="project-view__role-icon-wrap">{getRoleIcon(roleId)}</span>
                      <span className="project-view__role-label">{getRoleLabel(roleId)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      {projectId && (
        <RequestModal
          isOpen={requestModalOpen}
          projectId={projectId}
          onClose={() => setRequestModalOpen(false)}
          onSuccess={(requestId) => {
            onRequestSent?.(requestId);
          }}
        />
      )}
      {projectId && project && classId && (
        <MemberManagerModal
          isOpen={memberManagerOpen}
          onClose={() => setMemberManagerOpen(false)}
          projectId={projectId}
          classId={classId}
          project={project}
          initialMembers={projectMembers}
          onMembersChange={onMembersChange}
        />
      )}
      {projectId && project && (
        <EditProjectModal
          isOpen={editProjectOpen}
          onClose={() => setEditProjectOpen(false)}
          project={project}
          projectMembers={projectMembers}
          canManageAdmins={canManageAdmins}
          canEditProjectDetails={canManageProject}
          onProjectChange={onMembersChange}
          onDelete={onDelete}
        />
      )}
      {canDeleteEmptyProject && (
        <ConfirmModal
          isOpen={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          onConfirm={() => void handleDeleteEmptyProject()}
          title="Delete project?"
          message={`Nobody is left in "${project?.name ?? projectTitle}". Deleting it removes the project for good; this cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
        />
      )}
    </div>
  );
};

export default ProjectView;

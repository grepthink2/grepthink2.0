import React, { useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brush, MonitorSmartphone, MonitorCog, Database, SquarePen, Copy, Check, MessageCircleMore, ChevronDown, LogOut/*, Building2, Globe, Mail, User*/ } from 'lucide-react';
import { useClickOutside } from '@features/app/components/Interest/useClickOutside';
import EmailIcon from '@assets/ic_outline-email.svg';
import GithubIcon from '@assets/line-md_github.svg';
import LinkedInIcon from '@assets/mdi_linkedin.svg';
import CodeIcon from '@assets/material-symbols_code-rounded.svg';
import './ProjectView.scss';
import { useAuth } from '@/lib/auth';
import { MessageButton } from '@features/messages/components/MessageButton';
import RequestModal from './RequestModal';
import MemberManagerModal from './MemberManagerModal';
import EditProjectModal from '../EditProject/EditProjectModal';
import { api } from '@/lib/api';
import type { ApiProject, ApiProjectMember, ApiProjectTA } from '@/lib/api';
import { getMemberCopyEmail } from '@/features/app/utils/memberUtils';
import { Skeleton } from '@/components/Skeleton/Skeleton';

/** Loading placeholder mirroring the project header + team-members layout. */
export const ProjectViewSkeleton: React.FC = () => (
  <div className="project-view" aria-busy="true">
    <div className="project-view__header">
      <div className="project-view__header-content">
        <div className="project-view__header-left">
          <Skeleton width={260} height={28} />
          <Skeleton width={120} height={14} style={{ marginTop: 8 }} />
          <div className="project-view__stats" style={{ marginTop: 12 }}>
            <Skeleton width={90} height={14} />
            <Skeleton width={70} height={14} />
          </div>
          <div className="project-view__divider" />
          <div className="project-view__skills-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} width={70} height={24} radius={20} />
            ))}
          </div>
        </div>
        <div className="project-view__header-right">
          <Skeleton width={130} height={38} radius={8} />
        </div>
      </div>
    </div>
    <div className="project-view__content">
      <div className="project-view__left-column">
        <div
          className="project-view__markdown"
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          <Skeleton width="90%" height={14} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="95%" height={14} />
          <Skeleton width="60%" height={14} />
        </div>
      </div>
      <div className="project-view__right-column">
        <div className="project-view__section">
          <div className="project-view__section-header">
            <Skeleton width={140} height={18} />
          </div>
          <div className="project-view__team-list">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="project-view__team-member">
                <div className="project-view__member-avatar">
                  <Skeleton circle height={44} />
                </div>
                <div className="project-view__member-info">
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="40%" height={12} style={{ marginTop: 6 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);

export interface ProjectViewMember {
  id?: string;
  displayName: string;
  roleLabel: string;
  email?: string;
  githubUrl?: string;
  linkedInUrl?: string;
  imageUrl?: string;
}

/** Roles that can manage the project (add/drop members, edit project). */
const MANAGER_ROLES = ['owner', 'admin', 'product owner'] as const;

interface ProjectViewProps {
  projectId?: string;
  projectTitle: string;
  teamSize?: string;
  className?: string;
  descriptionMarkdown: string;
  skills: string[];
  selectedRoles: string[];
  members?: ProjectViewMember[];
  /** TAs assigned to oversee this project. Shown separately from team members. */
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
  // Sponsor information — typed so callers compile; rendering is gated
  // behind the (still commented-out) sponsor section in the JSX below.
  sponsorName?: string | null;
  sponsorCompany?: string | null;
  sponsorEmail?: string | null;
  sponsorWebsite?: string | null;
  sponsorDescription?: string | null;
}

const ProjectView: React.FC<ProjectViewProps> = ({
  projectId,
  projectTitle,
  teamSize: teamSizeInput = '',
  className = 'CSE 115B',
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
  // sponsorName,
  // sponsorCompany,
  // sponsorEmail,
  // sponsorWebsite,
  // sponsorDescription,
}) => {
  const { role, user } = useAuth();
  const isInstructor = role === 'instructor';
  const canManageProject =
    isInstructor ||
    (userRoleOnProject != null && MANAGER_ROLES.includes(userRoleOnProject as (typeof MANAGER_ROLES)[number]));
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestedHovered, setRequestedHovered] = useState(false);
  const [cancellingRequest, setCancellingRequest] = useState(false);
  const [memberManagerOpen, setMemberManagerOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [emailsCopied, setEmailsCopied] = useState(false);
  const [joinedDropdownOpen, setJoinedDropdownOpen] = useState(false);
  const joinedDropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(joinedDropdownRef, useCallback(() => setJoinedDropdownOpen(false), []));

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

  const handleCopyAllEmails = async () => {
    const emails = projectMembers
      .map(getMemberCopyEmail)
      .filter((email): email is string => Boolean(email));
    if (emails.length === 0) return;

    try {
      await navigator.clipboard.writeText(emails.join(', '));
      setEmailsCopied(true);
      setTimeout(() => setEmailsCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const displayTitle = projectTitle.trim() ? projectTitle : 'Project Title';
  const totalMembers = parseInt(teamSizeInput.trim(), 10);
  const hasValidTeamSize = !isNaN(totalMembers) && totalMembers >= 1;
  const currentCount = members.length;
  const membersText = hasValidTeamSize
    ? `${currentCount}/${totalMembers} Members`
    : `${currentCount} Members`;
  const spotsAvailable = hasValidTeamSize ? totalMembers - currentCount : null;
  const spotsText = spotsAvailable !== null ? `${spotsAvailable} Spots Available` : 'Spots Available';

  const getRoleIcon = (roleId: string) => {
    const size = 18;
    const iconProps = { size, color: 'white', strokeWidth: 2 };
    switch (roleId) {
      case 'designer':
        return <Brush {...iconProps} />;
      case 'frontend':
        return <MonitorSmartphone {...iconProps} />;
      case 'backend':
        return <MonitorCog {...iconProps} />;
      case 'database':
        return <Database {...iconProps} />;
      default:
        return <img src={CodeIcon} alt={roleId} className="project-view__role-icon-img" />;
    }
  };

  const getRoleLabel = (roleId: string) => {
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
  };

  return (
    <div className="project-view">
      {/* Header */}
      <div className="project-view__header">
        <div className="project-view__header-content">
          <div className="project-view__header-left">
            <h1 className="project-view__title">{displayTitle}</h1>
            <p className="project-view__class-name">{className}</p>
            <div className="project-view__stats">
              <span className="project-view__stat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {membersText}
              </span>
              <span className="project-view__stat">{spotsText}</span>
            </div>
            <div className="project-view__divider"></div>
            <div className="project-view__looking-for">
              <img src={CodeIcon} alt="Code" className="project-view__icon" />
              <span>Looking for:</span>
              <div className="project-view__skills-list">
                {skills.length > 0 ? (
                  skills.map((skill) => (
                    <span key={skill} className="project-view__skill-tag">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="project-view__skill-tag">Members</span>
                )}
              </div>
            </div>
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
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  Add/Drop Members
                </button>
                <button
                  className="project-view__request-button"
                  onClick={() => projectId && project && setEditProjectOpen(true)}
                  disabled={!projectId || !project}
                >
                  <SquarePen size={18} />
                  Edit Project/Roles
                </button>
              </div>
            ) : userRoleOnProject != null && userRoleOnProject !== '' ? (
              <div className="project-view__joined-dropdown" ref={joinedDropdownRef}>
                <button
                  type="button"
                  className="project-view__joined-btn"
                  onClick={() => setJoinedDropdownOpen((o) => !o)}
                  aria-expanded={joinedDropdownOpen}
                  aria-haspopup="menu"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Joined
                  <ChevronDown size={16} />
                </button>
                {joinedDropdownOpen && (
                  <div className="project-view__joined-menu" role="menu">
                    <button
                      type="button"
                      className="project-view__joined-menu-item project-view__joined-menu-item--danger"
                      role="menuitem"
                      onClick={() => {
                        setJoinedDropdownOpen(false);
                        onLeave?.();
                      }}
                    >
                      <LogOut size={15} />
                      Leave Project
                    </button>
                  </div>
                )}
              </div>
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    Unsend
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Requested
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="project-view__request-button"
                onClick={() => setRequestModalOpen(true)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Request to Join
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="project-view__content">
        {/* Left Column - Markdown Preview */}
        <div className="project-view__left-column">
          <div className="project-view__markdown">
            <ReactMarkdown>{descriptionMarkdown}</ReactMarkdown>
          </div>
        </div>

        {/* Right Column - Team & Roles */}
        <div className="project-view__right-column">
          {/* Team Members */}
          <div className="project-view__section">
            <div className="project-view__section-header">
              <h3 className="project-view__section-title">Team Members</h3>
              {projectMembers.length > 0 && (
                <button
                  type="button"
                  className={`project-view__copy-emails-btn${
                    emailsCopied ? ' project-view__copy-emails-btn--copied' : ''
                  }`}
                  onClick={() => void handleCopyAllEmails()}
                  aria-label="Copy all team member emails"
                  title="Copy all team member emails"
                >
                  {emailsCopied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{emailsCopied ? 'Copied' : 'Copy All Emails'}</span>
                </button>
              )}
            </div>
            <div className="project-view__team-list">
              {members.length === 0 ? (
                <div className="project-view__team-member">
                  <div className="project-view__member-avatar">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div className="project-view__member-info">
                    <div className="project-view__member-name">No members yet</div>
                    <div className="project-view__member-role">—</div>
                    <div className="project-view__member-links" />
                  </div>
                </div>
              ) : (
                members.map((member, index) => (
                  <div key={member.id ?? `member-${index}`} className="project-view__team-member">
                    <div className="project-view__member-avatar">
                      {member.imageUrl ? (
                        <img
                          src={member.imageUrl}
                          alt={member.displayName}
                          className="project-view__member-avatar-img"
                        />
                      ) : (
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      )}
                    </div>
                    <div className="project-view__member-info">
                      <div className="project-view__member-name">{member.displayName}</div>
                      <div className="project-view__member-role">{member.roleLabel}</div>
                      <div className="project-view__member-links">
                        {member.email ? (
                          <a href={`mailto:${member.email}`} target="_blank" rel="noopener noreferrer" className="project-view__link-icon-wrap" title={member.email} aria-label={`Email ${member.displayName}`}>
                            <img src={EmailIcon} alt="" className="project-view__link-icon" />
                          </a>
                        ) : (
                          <span className="project-view__link-icon-wrap project-view__link-icon-wrap--empty" aria-hidden="true">
                            <img src={EmailIcon} alt="" className="project-view__link-icon" />
                          </span>
                        )}
                        {member.githubUrl ? (
                          <a href={member.githubUrl} target="_blank" rel="noopener noreferrer" className="project-view__link-icon-wrap" title="GitHub" aria-label={`${member.displayName} GitHub`}>
                            <img src={GithubIcon} alt="" className="project-view__link-icon" />
                          </a>
                        ) : (
                          <span className="project-view__link-icon-wrap project-view__link-icon-wrap--empty" aria-hidden="true">
                            <img src={GithubIcon} alt="" className="project-view__link-icon" />
                          </span>
                        )}
                        {member.linkedInUrl ? (
                          <a href={member.linkedInUrl} target="_blank" rel="noopener noreferrer" className="project-view__link-icon-wrap" title="LinkedIn" aria-label={`${member.displayName} LinkedIn`}>
                            <img src={LinkedInIcon} alt="" className="project-view__link-icon" />
                          </a>
                        ) : (
                          <span className="project-view__link-icon-wrap project-view__link-icon-wrap--empty" aria-hidden="true">
                            <img src={LinkedInIcon} alt="" className="project-view__link-icon" />
                          </span>
                        )}
                        {member.id && member.id !== user?.id && (
                          <MessageButton
                            toUserId={member.id}
                            toUserName={member.displayName}
                            className="project-view__link-icon-wrap project-view__message-icon-wrap"
                          >
                            <MessageCircleMore
                              size={18}
                              strokeWidth={2.75}
                              className="project-view__message-icon"
                              aria-hidden="true"
                            />
                          </MessageButton>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Teaching Assistants — overseers, not team members. */}
          {tas.length > 0 && (
            <div className="project-view__section">
              <h3 className="project-view__section-title">Teaching Assistants</h3>
              <div className="project-view__team-list">
                {tas.map((ta) => (
                  <div key={ta.user_id} className="project-view__team-member">
                    <div className="project-view__member-avatar">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div className="project-view__member-info">
                      <div className="project-view__member-name">{ta.name}</div>
                      <div className="project-view__member-role">Teaching Assistant</div>
                      <div className="project-view__member-links">
                        {ta.email ? (
                          <a href={`mailto:${ta.email}`} target="_blank" rel="noopener noreferrer" className="project-view__link-icon-wrap" title={ta.email} aria-label={`Email ${ta.name}`}>
                            <img src={EmailIcon} alt="" className="project-view__link-icon" />
                          </a>
                        ) : (
                          <span className="project-view__link-icon-wrap project-view__link-icon-wrap--empty" aria-hidden="true">
                            <img src={EmailIcon} alt="" className="project-view__link-icon" />
                          </span>
                        )}
                        {ta.user_id && ta.user_id !== user?.id && (
                          <MessageButton
                            toUserId={ta.user_id}
                            toUserName={ta.name}
                            className="project-view__link-icon-wrap project-view__message-icon-wrap"
                          >
                            <MessageCircleMore
                              size={18}
                              strokeWidth={2.75}
                              className="project-view__message-icon"
                              aria-hidden="true"
                            />
                          </MessageButton>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Roles Needed */}
          {selectedRoles.length > 0 && (
            <div className="project-view__section">
              <h3 className="project-view__section-title">Roles Needed</h3>
              <div className="project-view__roles-list">
                {selectedRoles.map((roleId) => (
                  <div key={roleId} className="project-view__role-item">
                    <div className="project-view__role-icon-wrap">
                      {getRoleIcon(roleId)}
                    </div>
                    <span className="project-view__role-label">{getRoleLabel(roleId)}</span>
                    <span className="project-view__role-count">+1</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sponsor Information */}
          {/* {(sponsorName || sponsorCompany || sponsorEmail || sponsorWebsite || sponsorDescription) && (
            <div className="project-view__section">
              <h3 className="project-view__section-title">Sponsor Information</h3>
              <div className="project-view__sponsor-card">
                {sponsorCompany && (
                  <div className="project-view__sponsor-row">
                    <Building2 size={16} />
                    <span className="project-view__sponsor-label">Company</span>
                    <span className="project-view__sponsor-value">{sponsorCompany}</span>
                  </div>
                )}
                {sponsorName && (
                  <div className="project-view__sponsor-row">
                    <User size={16} />
                    <span className="project-view__sponsor-label">Contact</span>
                    <span className="project-view__sponsor-value">{sponsorName}</span>
                  </div>
                )}
                {sponsorEmail && (
                  <div className="project-view__sponsor-row">
                    <Mail size={16} />
                    <span className="project-view__sponsor-label">Email</span>
                    <a href={`mailto:${sponsorEmail}`} className="project-view__sponsor-link">{sponsorEmail}</a>
                  </div>
                )}
                {sponsorWebsite && (
                  <div className="project-view__sponsor-row">
                    <Globe size={16} />
                    <span className="project-view__sponsor-label">Website</span>
                    <a href={sponsorWebsite} target="_blank" rel="noopener noreferrer" className="project-view__sponsor-link">{sponsorWebsite}</a>
                  </div>
                )}
                {sponsorDescription && (
                  <div className="project-view__sponsor-description">
                    <p>{sponsorDescription}</p>
                  </div>
                )}
              </div>
            </div>
          )} */}
        </div>
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
          onProjectChange={onMembersChange}
          onDelete={onDelete}
        />
      )}
    </div>
  );
};

export default ProjectView;

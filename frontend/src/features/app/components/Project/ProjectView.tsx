import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brush, MonitorSmartphone, MonitorCog, Database, SquarePen/*, Building2, Globe, Mail, User*/ } from 'lucide-react';
import EmailIcon from '@assets/ic_outline-email.svg';
import GithubIcon from '@assets/line-md_github.svg';
import LinkedInIcon from '@assets/mdi_linkedin.svg';
import CodeIcon from '@assets/material-symbols_code-rounded.svg';
import './ProjectView.scss';
import { useAuth } from '@/lib/auth';
import RequestModal from './RequestModal';
import MemberManagerModal from './MemberManagerModal';
import EditProjectModal from '../EditProject/EditProjectModal';
import type { ApiProject, ApiProjectMember } from '@/lib/api';

export interface ProjectViewMember {
  id?: string;
  displayName: string;
  roleLabel: string;
  email?: string;
  githubUrl?: string;
  linkedInUrl?: string;
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
  // Sponsor information
  // sponsorName?: string;
  // sponsorCompany?: string;
  // sponsorEmail?: string;
  // sponsorWebsite?: string;
  // sponsorDescription?: string;
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
  userRoleOnProject,
  classId,
  project,
  projectMembers = [],
  onMembersChange,
  onDelete,
  // sponsorName,
  // sponsorCompany,
  // sponsorEmail,
  // sponsorWebsite,
  // sponsorDescription,
}) => {
  const { role } = useAuth();
  const isInstructor = role === 'instructor';
  const canManageProject =
    isInstructor ||
    (userRoleOnProject != null && MANAGER_ROLES.includes(userRoleOnProject as (typeof MANAGER_ROLES)[number]));
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [memberManagerOpen, setMemberManagerOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);

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
              <span className="project-view__joined" aria-label="You are a member of this project">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Joined
              </span>
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
            <h3 className="project-view__section-title">Team Members</h3>
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
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div className="project-view__member-info">
                      <div className="project-view__member-name">{member.displayName}</div>
                      <div className="project-view__member-role">{member.roleLabel}</div>
                      <div className="project-view__member-links">
                        {member.email ? (
                          <a href={`mailto:${member.email}`} className="project-view__link-icon-wrap" title={member.email} aria-label={`Email ${member.displayName}`}>
                            <img src={EmailIcon} alt="" className="project-view__link-icon" />
                          </a>
                        ) : (
                          <span className="project-view__link-icon-wrap project-view__link-icon-wrap--empty" aria-hidden="true">
                            <img src={EmailIcon} alt="" className="project-view__link-icon" />
                          </span>
                        )}
                        <a href={member.githubUrl || '#'} className="project-view__link-icon-wrap" title="GitHub" aria-label={`${member.displayName} GitHub`} onClick={(e) => !member.githubUrl && e.preventDefault()}>
                          <img src={GithubIcon} alt="" className="project-view__link-icon" />
                        </a>
                        <a href={member.linkedInUrl || '#'} className="project-view__link-icon-wrap" title="LinkedIn" aria-label={`${member.displayName} LinkedIn`} onClick={(e) => !member.linkedInUrl && e.preventDefault()}>
                          <img src={LinkedInIcon} alt="" className="project-view__link-icon" />
                        </a>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

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
          onSuccess={() => {
            // Optional: refetch project or show toast when backend supports it
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

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Brush, MonitorSmartphone, MonitorCog, Database, SquarePen } from 'lucide-react';
import EmailIcon from '@assets/ic_outline-email.svg';
import GithubIcon from '@assets/line-md_github.svg';
import LinkedInIcon from '@assets/mdi_linkedin.svg';
import CodeIcon from '@assets/material-symbols_code-rounded.svg';
import './ProjectView.scss';
import { useAuth } from '@/lib/auth';
import RequestModal from './RequestModal';

export interface ProjectViewMember {
  id?: string;
  displayName: string;
  roleLabel: string;
  email?: string;
  githubUrl?: string;
  linkedInUrl?: string;
}

interface ProjectViewProps {
  projectTitle: string;
  teamSize?: string;
  className?: string;
  descriptionMarkdown: string;
  skills: string[];
  selectedRoles: string[];
  members?: ProjectViewMember[];
}

const ProjectView: React.FC<ProjectViewProps> = ({
  projectTitle,
  teamSize: teamSizeInput = '',
  className = 'CSE 115B',
  descriptionMarkdown,
  skills,
  selectedRoles,
  members = [],
}) => {
  const { role } = useAuth();
  const isInstructor = role === 'instructor';
  const [requestModalOpen, setRequestModalOpen] = useState(false);

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
            {isInstructor ? (
              <div className="project-view__instructor-actions">
                <button className="project-view__request-button">
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
                <button className="project-view__request-button">
                  <SquarePen size={18} />
                  Edit Project
                </button>
              </div>
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
        </div>
      </div>

      <RequestModal
        isOpen={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        onSubmit={(message) => {
          // TODO: wire to project request API when available
          console.log('Project request submitted:', message || '(no message)');
        }}
      />
    </div>
  );
};

export default ProjectView;

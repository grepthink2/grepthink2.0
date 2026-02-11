import React from 'react';
import ReactMarkdown from 'react-markdown';
import CodeIcon from '@assets/material-symbols_code-rounded.svg';
import MonitorIcon from '@assets/material-symbols_monitor-outline-rounded.svg';
import DatabaseIcon from '@assets/material-symbols_database-outline.svg';
import EmailIcon from '@assets/ic_outline-email.svg';
import GithubIcon from '@assets/line-md_github.svg';
import LinkedInIcon from '@assets/mdi_linkedin.svg';
import './ProjectView.scss';

interface ProjectViewProps {
  projectTitle: string;
  teamSize?: string;
  className?: string;
  problemStatement: string;
  projectGoals: string;
  workingOn: string;
  techStack: string;
  skills: string[];
  selectedRoles: string[];
  descriptionMode: 'template' | 'markdown';
  markdownContent?: string;
}

const CURRENT_MEMBERS_PREVIEW = 1;

const ProjectView: React.FC<ProjectViewProps> = ({
  projectTitle,
  teamSize: teamSizeInput = '',
  className = 'CSE 115B',
  problemStatement,
  projectGoals,
  workingOn,
  techStack,
  skills,
  selectedRoles,
  descriptionMode,
  markdownContent,
}) => {
  const displayTitle = projectTitle.trim() ? projectTitle : 'Project Title';
  const totalMembers = parseInt(teamSizeInput.trim(), 10);
  const hasValidTeamSize = !isNaN(totalMembers) && totalMembers >= 1;
  const membersText = hasValidTeamSize
    ? `${CURRENT_MEMBERS_PREVIEW}/${totalMembers} Members`
    : `${CURRENT_MEMBERS_PREVIEW}/ Members`;
  const spotsAvailable = hasValidTeamSize ? totalMembers - CURRENT_MEMBERS_PREVIEW : null;
  const spotsText = spotsAvailable !== null ? `${spotsAvailable} Spots Available` : 'Spots Available';

  const generateTemplateMarkdown = () => {
    return `
# Project Overview

A concise summary of the problem, goals, scope, and tools behind this project.

### Problem Statement

${problemStatement || '{{what_are_you_solving}}'}


### Project Goals

${projectGoals || '{{project_goals}}'}


### Scope of Work

${workingOn || '{{what_you_are_working_on}}'}


### Tech Stack

${techStack || '{{tech_stack}}'}


`;
  };

  const getMarkdownContent = () => {
    if (descriptionMode === 'markdown' && markdownContent) {
      return markdownContent;
    }
    return generateTemplateMarkdown();
  };

  const getRoleIcon = (roleId: string) => {
    switch (roleId) {
      case 'frontend':
        return MonitorIcon;
      case 'database':
        return DatabaseIcon;
      default:
        return CodeIcon;
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
            <button className="project-view__request-button">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
              Request to Join
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="project-view__content">
        {/* Left Column - Markdown Preview */}
        <div className="project-view__left-column">
          <div className="project-view__markdown">
            <ReactMarkdown>{getMarkdownContent()}</ReactMarkdown>
          </div>
        </div>

        {/* Right Column - Team & Roles */}
        <div className="project-view__right-column">
          {/* Team Members */}
          <div className="project-view__section">
            <h3 className="project-view__section-title">Team Members</h3>
            <div className="project-view__team-list">
              <div className="project-view__team-member">
                <div className="project-view__member-avatar">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="project-view__member-info">
                  <div className="project-view__member-name">Cole Saulnier</div>
                  <div className="project-view__member-role">Product Owner</div>
                  <div className="project-view__member-links">
                    <img src={EmailIcon} alt="Email" className="project-view__link-icon" />
                    <img src={GithubIcon} alt="GitHub" className="project-view__link-icon" />
                    <img src={LinkedInIcon} alt="LinkedIn" className="project-view__link-icon" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Roles Needed */}
          {selectedRoles.length > 0 && (
            <div className="project-view__section">
              <h3 className="project-view__section-title">Roles Needed</h3>
              <div className="project-view__roles-list">
                {selectedRoles.map((roleId) => (
                  <div key={roleId} className="project-view__role-item">
                    <img
                      src={getRoleIcon(roleId)}
                      alt={roleId}
                      className="project-view__role-icon"
                    />
                    <span className="project-view__role-label">{getRoleLabel(roleId)}</span>
                    <span className="project-view__role-count">+1</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectView;

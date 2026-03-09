import React from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, ArrowRight } from 'lucide-react';
import octiconPeopleIcon from '@/assets/octicon_people-16.svg?url';
import './ProjectGrid.scss';

export interface ProjectGridItem {
  id: string;
  name: string;
  /** When absent, display as "~" until API returns member count */
  member_count?: number;
  team_size: number;
  status: 'open' | 'closed';
}

interface ProjectGridProps {
  projects: ProjectGridItem[];
}

const ProjectGrid: React.FC<ProjectGridProps> = ({ projects }) => (
  <div className="project-grid">
    {projects.map((project) => (
      <Link
        key={project.id}
        className="project-grid__card"
        to={`/app/projects/${project.id}`}
        state={{ projectName: project.name }}
      >
        <div className="project-grid__banner">
          <span className={`project-grid__tag project-grid__tag--${project.status}`}>
            {project.status === 'open' ? 'Open to join' : 'Closed'}
          </span>
          <FolderKanban className="project-grid__banner-icon" size={36} strokeWidth={1.5} />
        </div>

        <div className="project-grid__content">
          <h3 className="project-grid__name">{project.name}</h3>
          <div className="project-grid__row">
            <div className="project-grid__members">
              <img src={octiconPeopleIcon} alt="" className="project-grid__members-icon" />
              <span>{project.member_count != null ? project.member_count : '~'}/{project.team_size} members</span>
            </div>
            <span className="project-grid__see-all">
              View <ArrowRight size={16} />
            </span>
          </div>
        </div>
      </Link>
    ))}
  </div>
);

export default ProjectGrid;

import React from 'react';
import { Smile, Meh, Frown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import './ProjectHealth.scss';

export type HealthStatus = 'excellent' | 'warning' | 'poor';

export interface ProjectHealthItem {
  id: string;
  name: string;
  health: HealthStatus;
  description: string;
  via: string;
}

interface ProjectHealthProps {
  projects: ProjectHealthItem[];
  onDetails?: (projectId: string) => void;
}

const healthFaceIcon = {
  excellent: Smile,
  warning: Meh,
  poor: Frown,
} as const;

const ProjectHealth: React.FC<ProjectHealthProps> = ({ projects, onDetails }) => (
  <div className="project-health">
    <h3 className="project-health__heading">Project Health</h3>

    <div className="project-health__container">
      {projects.map((project) => (
        <div
          key={project.id}
          className={`health-card health-card--${project.health}`}
        >
          <div className="health-card__header">
            <div className="health-card__name-row">
              <span className="health-card__face-icon">
                {React.createElement(healthFaceIcon[project.health], { size: 20 })}
              </span>
              <span className="health-card__name">{project.name}</span>
            </div>
            <div className="health-card__trend-icon">
              {project.health === 'excellent' ? (
                <TrendingUp size={16} />
              ) : project.health === 'poor' ? (
                <TrendingDown size={16} />
              ) : (
                <Minus size={16} />
              )}
            </div>
          </div>

          <div className="health-card__body">
            <p className="health-card__description">{project.description}</p>
            <div className="health-card__footer">
              <span className="health-card__via">via {project.via}</span>
              <button
                className="health-card__details-btn"
                onClick={() => onDetails?.(project.id)}
              >
                Details →
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default ProjectHealth;

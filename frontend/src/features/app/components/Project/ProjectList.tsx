import React from 'react';
import { Smile, Meh, Frown, ChevronRight } from 'lucide-react';
import { TableSkeleton } from '@/components/Skeleton/TableSkeleton';
import './ProjectList.scss';

export type ProjectSentiment = 'positive' | 'neutral' | 'negative';

export interface UiProject {
  id: string;
  name: string;
  students: number;
  poName: string;
  poEmail: string;
  smName: string;
  smEmail: string;
  sentiment: ProjectSentiment;
}

interface ProjectListProps {
  projects: UiProject[];
  loading: boolean;
  error: string | null;
  onProjectClick?: (project: UiProject) => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ projects, loading, error, onProjectClick }) => {
  const renderSentiment = (sentiment: ProjectSentiment) => {
    const label =
      sentiment === 'positive' ? 'Positive' : sentiment === 'neutral' ? 'Neutral' : 'Negative';
    const Icon = sentiment === 'positive' ? Smile : sentiment === 'neutral' ? Meh : Frown;

    return (
      <span className={`projects-table__sentiment projects-table__sentiment--${sentiment}`}>
        <Icon size={14} />
        <span>{label}</span>
      </span>
    );
  };

  if (loading) {
    return (
      <TableSkeleton
        block="assignment-list"
        title="Project Count"
        headers={['Name', 'Team Size', 'PO', 'SM', 'Sentiment', '']}
        rows={8}
        cellWidths={['60%', '30%', '80%', '80%', '90%', 16]}
      />
    );
  }

  if (error) {
    return (
      <div className="assignment-list">
        <div className="assignment-list__header">
          <h2 className="assignment-list__title">Project Count</h2>
        </div>
        <div className="assignment-list__table-card">
          <div className="assignment-list__table-wrapper">
            <div className="projects-table__empty-state">Error loading projects: {error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="assignment-list">
        <div className="assignment-list__header">
          <h2 className="assignment-list__title">Project Count</h2>
          <span className="assignment-list__count-badge">0</span>
        </div>
        <div className="assignment-list__table-card">
          <div className="assignment-list__table-wrapper">
            <div className="projects-table__empty-state">No projects yet.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="assignment-list">
      <div className="assignment-list__header">
        <h2 className="assignment-list__title">Project Count</h2>
        <span className="assignment-list__count-badge">{projects.length}</span>
      </div>

      <div className="assignment-list__table-card">
        <div className="assignment-list__table-wrapper">
          <table className="assignment-list__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Team Size</th>
                <th>PO</th>
                <th>SM</th>
                <th>Sentiment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className="projects-table__row"
                  onClick={() => onProjectClick?.(project)}
                >
                  <td className="assignment-list__td-title">{project.name}</td>
                  <td>{project.students}</td>
                  <td className="projects-table__person-cell">
                    <div className="projects-table__person-name">{project.poName}</div>
                    {project.poEmail ? (
                      <a
                        className="projects-table__person-email"
                        href={`mailto:${project.poEmail}`}
                      >
                        {project.poEmail}
                      </a>
                    ) : (
                      <span className="projects-table__person-email">—</span>
                    )}
                  </td>
                  <td className="projects-table__person-cell">
                    <div className="projects-table__person-name">{project.smName}</div>
                    {project.smEmail ? (
                      <a
                        className="projects-table__person-email"
                        href={`mailto:${project.smEmail}`}
                      >
                        {project.smEmail}
                      </a>
                    ) : (
                      <span className="projects-table__person-email">—</span>
                    )}
                  </td>
                  <td>{renderSentiment(project.sentiment)}</td>
                  <td className="projects-table__arrow-cell">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProjectList;


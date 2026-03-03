import React, { useState } from 'react';
import { Users } from 'lucide-react';
import './MyProjects.scss';

interface Project {
  id: string;
  title: string;
  className: string;
  teamSize: string;
  memberCount: number;
  spotsAvailable: number;
  status: 'active' | 'inactive';
}

const MyProjects: React.FC = () => {
  const [showInactive, setShowInactive] = useState(false);

  // Placeholder data
  const projects: Project[] = [
    {
      id: '1',
      title: 'AI Chatbot Assistant',
      className: 'CSE 115B',
      teamSize: '3/4',
      memberCount: 3,
      spotsAvailable: 1,
      status: 'active',
    },
    {
      id: '2',
      title: 'E-commerce Platform',
      className: 'CMPM 150',
      teamSize: '2/4',
      memberCount: 2,
      spotsAvailable: 2,
      status: 'active',
    },
    {
      id: '3',
      title: 'Campus Event Finder',
      className: 'CSE 115B',
      teamSize: '4/4',
      memberCount: 4,
      spotsAvailable: 0,
      status: 'active',
    },
    {
      id: '4',
      title: 'Study Group Matcher',
      className: 'CMPS 111',
      teamSize: '3/3',
      memberCount: 3,
      spotsAvailable: 0,
      status: 'active',
    },
    {
      id: '5',
      title: 'Fitness Tracker App',
      className: 'CSE 115B',
      teamSize: '2/3',
      memberCount: 2,
      spotsAvailable: 1,
      status: 'inactive',
    },
    {
      id: '6',
      title: 'Recipe Sharing Platform',
      className: 'CMPM 150',
      teamSize: '1/4',
      memberCount: 1,
      spotsAvailable: 3,
      status: 'inactive',
    },
  ];

  const filteredProjects = projects.filter((project) =>
    showInactive ? project.status === 'inactive' : project.status === 'active'
  );

  const sectionTitle = showInactive ? 'Inactive Projects' : 'Active Projects';

  return (
    <div className="my-projects">
      {/* Toggle Section */}
      <div className="my-projects__toggle-container">
        <span
          className={`my-projects__toggle-label ${!showInactive ? 'my-projects__toggle-label--active' : ''}`}
        >
          Active
        </span>
        <button
          className={`my-projects__toggle ${showInactive ? 'inactive' : 'active'}`}
          onClick={() => setShowInactive(!showInactive)}
          aria-label="Toggle between active and inactive projects"
        >
          <div className="my-projects__toggle-slider"></div>
        </button>
        <span
          className={`my-projects__toggle-label ${showInactive ? 'my-projects__toggle-label--active' : ''}`}
        >
          Inactive
        </span>
      </div>

      {/* Divider */}
      <div className="my-projects__divider"></div>

      {/* Section Title */}
      <h2 className="my-projects__section-title">{sectionTitle}</h2>

      {/* Projects Grid */}
      <div className="my-projects__grid">
        {filteredProjects.map((project) => (
          <div key={project.id} className="project-card">
            {/* Card Header - Dark Grey */}
            <div className="project-card__header">
              <h3 className="project-card__title">{project.title}</h3>
              <p className="project-card__class-name">{project.className}</p>
            </div>

            {/* Card Body - Light Grey */}
            <div className="project-card__body">
              {/* Team Size */}
              <div className="project-card__stat">
                <Users size={14} />
                <span>{project.teamSize} Members</span>
              </div>

              {/* Spots Available */}
              {project.spotsAvailable > 0 && (
                <div className="project-card__spots">
                  {project.spotsAvailable} Spot{project.spotsAvailable !== 1 ? 's' : ''} Available
                </div>
              )}

              {/* See All Button */}
              <button className="project-card__see-all">See All</button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 && (
        <div className="my-projects__empty">
          <p>No {showInactive ? 'inactive' : 'active'} projects available at the moment.</p>
        </div>
      )}
    </div>
  );
};

export default MyProjects;

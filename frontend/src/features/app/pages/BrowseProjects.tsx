import React, { useState } from 'react';
import { Users, Briefcase } from 'lucide-react';
import './BrowseProjects.scss';

interface Project {
  id: string;
  title: string;
  className: string;
  description: string;
  teamSize: string;
  memberCount: number;
  spotsAvailable: number;
  skills: string[];
  lookingForRoles: string[];
  status: 'active' | 'inactive';
}

const BrowseProjects: React.FC = () => {
  const [showInactive, setShowInactive] = useState(false);

  // Placeholder data
  const projects: Project[] = [
    {
      id: '1',
      title: 'AI Chatbot Assistant',
      className: 'CSE 115B',
      description: 'Building an intelligent chatbot using natural language processing to help students with course-related questions.',
      teamSize: '3/4',
      memberCount: 3,
      spotsAvailable: 1,
      skills: ['Python', 'React', 'NLP', 'TensorFlow'],
      lookingForRoles: ['Backend Developer', 'ML Engineer'],
      status: 'active',
    },
    {
      id: '2',
      title: 'E-commerce Platform',
      className: 'CMPM 150',
      description: 'A full-stack e-commerce solution with real-time inventory management and payment processing.',
      teamSize: '2/4',
      memberCount: 2,
      spotsAvailable: 2,
      skills: ['Node.js', 'MongoDB', 'React', 'Stripe'],
      lookingForRoles: ['Frontend Developer', 'Database Specialist'],
      status: 'active',
    },
    {
      id: '3',
      title: 'Campus Event Finder',
      className: 'CSE 115B',
      description: 'Mobile-first web app to discover and register for campus events with personalized recommendations.',
      teamSize: '4/4',
      memberCount: 4,
      spotsAvailable: 0,
      skills: ['React Native', 'Firebase', 'UI/UX'],
      lookingForRoles: [],
      status: 'active',
    },
    {
      id: '4',
      title: 'Study Group Matcher',
      className: 'CMPS 111',
      description: 'Platform connecting students with similar study habits and schedules for effective group study sessions.',
      teamSize: '3/3',
      memberCount: 3,
      spotsAvailable: 0,
      skills: ['Java', 'Spring Boot', 'PostgreSQL'],
      lookingForRoles: [],
      status: 'active',
    },
    {
      id: '5',
      title: 'Fitness Tracker App',
      className: 'CSE 115B',
      description: 'Web application for tracking workouts, nutrition, and health metrics with data visualization.',
      teamSize: '2/3',
      memberCount: 2,
      spotsAvailable: 1,
      skills: ['Vue.js', 'D3.js', 'Python', 'Flask'],
      lookingForRoles: ['Data Visualization Specialist'],
      status: 'inactive',
    },
    {
      id: '6',
      title: 'Recipe Sharing Platform',
      className: 'CMPM 150',
      description: 'Community-driven recipe platform with photo uploads, ratings, and meal planning features.',
      teamSize: '1/4',
      memberCount: 1,
      spotsAvailable: 3,
      skills: ['React', 'Node.js', 'AWS S3'],
      lookingForRoles: ['Frontend Developer', 'Backend Developer', 'UI Designer'],
      status: 'inactive',
    },
  ];

  const filteredProjects = projects.filter((project) =>
    showInactive ? project.status === 'inactive' : project.status === 'active'
  );

  const sectionTitle = showInactive ? 'Inactive Projects' : 'Active Projects';

  return (
    <div className="browse-projects">
      {/* Toggle Section */}
      <div className="browse-projects__toggle-container">
        <span
          className={`browse-projects__toggle-label ${!showInactive ? 'browse-projects__toggle-label--active' : ''}`}
        >
          Active
        </span>
        <button
          className={`browse-projects__toggle ${showInactive ? 'inactive' : 'active'}`}
          onClick={() => setShowInactive(!showInactive)}
          aria-label="Toggle between active and inactive projects"
        >
          <div className="browse-projects__toggle-slider"></div>
        </button>
        <span
          className={`browse-projects__toggle-label ${showInactive ? 'browse-projects__toggle-label--active' : ''}`}
        >
          Inactive
        </span>
      </div>

      {/* Divider */}
      <div className="browse-projects__divider"></div>

      {/* Section Title */}
      <h2 className="browse-projects__section-title">{sectionTitle}</h2>

      {/* Projects Grid */}
      <div className="browse-projects__grid">
        {filteredProjects.map((project) => (
          <div key={project.id} className="project-card">
            {/* Card Header - Dark Grey */}
            <div className="project-card__header">
              <h3 className="project-card__title">{project.title}</h3>
              <p className="project-card__class-name">{project.className}</p>
            </div>

            {/* Card Body - Light Grey */}
            <div className="project-card__body">
              {/* Description */}
              <p className="project-card__description">{project.description}</p>

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

              {/* Skills */}
              <div className="project-card__skills">
                {project.skills.map((skill) => (
                  <span key={skill} className="project-card__skill-tag">
                    {skill}
                  </span>
                ))}
              </div>

              {/* Looking For */}
              {project.lookingForRoles && project.lookingForRoles.length > 0 && (
                <div className="project-card__looking-for">
                  <Briefcase size={12} />
                  <span className="project-card__looking-for-label">Looking for:</span>
                  <div className="project-card__roles">
                    {project.lookingForRoles.map((role) => (
                      <span key={role} className="project-card__role-tag">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredProjects.length === 0 && (
        <div className="browse-projects__empty">
          <p>No {showInactive ? 'inactive' : 'active'} projects available at the moment.</p>
        </div>
      )}
    </div>
  );
};

export default BrowseProjects;

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
// import { api } from '@/lib/api'; // TODO: Uncomment when API is implemented
import './ProjectDetails.scss';

// =============================================================================
// BACKEND API REQUIREMENTS - TODO for Backend Engineers
// =============================================================================
// The following API endpoints and data fields need to be implemented:
//
// 1. GET /api/projects/{project_id}
//    - Returns full project details including:
//      - description, core_features, target_audience
//      - owner username, members list, desired_skills
//      - updates, resources, TSR data, project tools
//
// 2. GET /api/projects/{project_id}/updates
//    - Returns list of project updates (for Updates tab)
//
// 3. GET /api/projects/{project_id}/resources
//    - Returns list of project resources (for Resources tab)
//
// 4. GET /api/projects/{project_id}/tsr
//    - Returns TSR document data (for TSR tab)
//
// 5. GET /api/projects/{project_id}/tools
//    - Returns project tools list (for Project Tools tab)
//
// Frontend: Structure ready, waiting for backend review from Ashton + Milan
// =============================================================================

interface ProjectData {
  id: string;
  title: string;
  description: string;
  owner: string;
  members: string[];
  desired_skills: string[];
  core_features: string[];
  target_audience: string[];
  course_name?: string;
}

type TabType = 'description' | 'updates' | 'resources' | 'tsr' | 'tools';

const ProjectDetails: React.FC = () => {
  const { courseId: _courseId, projectId } = useParams<{ courseId: string; projectId: string }>();
  const navigate = useNavigate();
  // _courseId is reserved for future use (e.g., fetching course-specific data)
  const [activeTab, setActiveTab] = useState<TabType>('description');
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch project data
  useEffect(() => {
    const fetchProjectData = async () => {
      if (!projectId) {
        setError('Project ID is required');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // BACKEND TODO: Replace with actual API call
        // const response = await api.getProjectDetails(projectId);
        // setProject(response.project);

        // Mock data for now - replace with actual API call
        setProject({
          id: projectId || '',
          title: 'GrepThink 2.0',
          description: 'A platform where users can build and collaborate on projects.',
          owner: 'username',
          members: ['member1', 'member2', 'member3'],
          desired_skills: ['frontend', 'backend', 'design'],
          core_features: [
            'Manage and organize project resources',
            'Track project progress and updates',
            'Collaborate with team members',
            'Share project tools and documentation',
          ],
          target_audience: [
            'Students working on collaborative projects',
            'Course instructors managing project teams',
            'Developers contributing to open projects',
          ],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load project details');
      } finally {
        setLoading(false);
      }
    };

    fetchProjectData();
  }, [projectId]);

  const tabs: { key: TabType; label: string }[] = [
    { key: 'description', label: 'Description' },
    { key: 'updates', label: 'Updates' },
    { key: 'resources', label: 'Resources' },
    { key: 'tsr', label: 'TSR' },
    { key: 'tools', label: 'Project Tools' },
  ];

  if (loading) {
    return (
      <div className="project-details">
        <div className="project-details__loading">
          <p>Loading project details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="project-details">
        <div className="project-details__error">
          <p>Error: {error}</p>
          <button onClick={() => navigate('/app/my-project')} className="project-details__back-button">
            Back to My Projects
          </button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-details">
        <div className="project-details__empty">
          <p>Project not found</p>
          <button onClick={() => navigate('/app/my-project')} className="project-details__back-button">
            Back to My Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="project-details">
      {/* Page Header */}
      <div className="project-details__header">
        <div className="project-details__header-left">
          <h1 className="project-details__title">{project.title}</h1>
          <p className="project-details__subtitle">Example Project</p>
        </div>
        <div className="project-details__header-right">
          <nav className="project-details__breadcrumb">
            <button onClick={() => navigate('/app/home')} className="project-details__breadcrumb-link">
              Home
            </button>
            <span className="project-details__breadcrumb-separator">&gt;</span>
            <button
              onClick={() => navigate('/app/my-classes')}
              className="project-details__breadcrumb-link"
            >
              Course
            </button>
            <span className="project-details__breadcrumb-separator">&gt;</span>
            <span className="project-details__breadcrumb-current">Project</span>
          </nav>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="project-details__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`project-details__tab ${activeTab === tab.key ? 'project-details__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Card */}
      <div className="project-details__card">
        <h2 className="project-details__card-title">{project.description}</h2>

        {activeTab === 'description' && (
          <>
            {/* Core Features Section */}
            <div className="project-details__section">
              <h3 className="project-details__section-title">Core Features</h3>
              <ul className="project-details__list">
                {project.core_features.map((feature, index) => (
                  <li key={index} className="project-details__list-item">
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Target Audience Section */}
            <div className="project-details__section">
              <h3 className="project-details__section-title">Target Audience</h3>
              <ul className="project-details__list">
                {project.target_audience.map((audience, index) => (
                  <li key={index} className="project-details__list-item">
                    {audience}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {activeTab === 'updates' && (
          <div className="project-details__section">
            <p className="project-details__empty-state">No updates yet.</p>
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="project-details__section">
            <p className="project-details__empty-state">No resources available yet.</p>
          </div>
        )}

        {activeTab === 'tsr' && (
          <div className="project-details__section">
            <p className="project-details__empty-state">TSR content coming soon.</p>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="project-details__section">
            <p className="project-details__empty-state">Project tools coming soon.</p>
          </div>
        )}
      </div>

      {/* Project Team Card */}
      <div className="project-details__card">
        {/* Project Owner */}
        <div className="project-details__team-section">
          <h3 className="project-details__team-label">Project Owner</h3>
          <div className="project-details__tags">
            <span className="project-details__tag">{project.owner}</span>
          </div>
        </div>

        {/* Members */}
        <div className="project-details__team-section">
          <h3 className="project-details__team-label">Members</h3>
          <div className="project-details__tags">
            {project.members.map((member, index) => (
              <span key={index} className="project-details__tag">
                {member}
              </span>
            ))}
          </div>
        </div>

        {/* Desired Skills */}
        <div className="project-details__team-section">
          <h3 className="project-details__team-label">Desired Skills</h3>
          <div className="project-details__tags">
            {project.desired_skills.map((skill, index) => (
              <span key={index} className="project-details__tag">
                {skill}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectDetails;

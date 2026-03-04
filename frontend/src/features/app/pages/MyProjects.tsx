import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClass, type Class } from '@/lib/classContext';
import { api, type ApiProject } from '@/lib/api';
import './MyProjects.scss';

// =============================================================================
// BACKEND API REQUIREMENTS - TODO for Backend Engineers
// =============================================================================
// The following data fields need to be added to the project API response:
//
// 1. description: string - Project description text
//    - Currently showing placeholder "Project description"
//    - Add to projects table and API response
//
// 2. owner_username: string - Username of project owner
//    - Currently showing placeholder "username"
//    - Join with users table to get username
//
// 3. member_count: number - Actual count of project members
//    - Currently hardcoded to 1
//    - Query project_members table
//
// 4. ENDPOINT: POST /api/projects/{project_id}/view
//    - Track when a user views a project (analytics)
//    - Called when user clicks on a project card
//
// Frontend: Ready to consume these fields when available
// =============================================================================

interface ProjectWithClass {
  id: string;
  title: string;
  className: string;
  courseCode?: string;
  teamSize: string;
  memberCount: number;
  spotsAvailable: number;
  status: 'active' | 'inactive';
}

interface GroupedProjects {
  classId: string;
  className: string;
  courseCode?: string;
  projects: ProjectWithClass[];
}

const MyProjects: React.FC = () => {
  const { classes } = useClass();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectWithClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Fetch projects for all user's classes
  useEffect(() => {
    const fetchProjects = async () => {
      if (classes.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch projects for each class
        const projectPromises = classes.map(async (cls: Class) => {
          try {
            const response = await api.getClassProjects(cls.id);
            return {
              classId: cls.id,
              className: cls.name,
              courseCode: cls.course_code,
              projects: response.projects || [],
            };
          } catch (err) {
            console.error(`Failed to fetch projects for class ${cls.id}:`, err);
            return {
              classId: cls.id,
              className: cls.name,
              courseCode: cls.course_code,
              projects: [],
            };
          }
        });

        const results = await Promise.all(projectPromises);

        // Flatten and transform projects
        const allProjects: ProjectWithClass[] = results.flatMap((result: { classId: string; className: string; courseCode?: string; projects: ApiProject[] }) =>
          result.projects.map((project: ApiProject) => ({
            id: project.id,
            title: project.title,
            className: result.className,
            courseCode: result.courseCode,
            teamSize: project.team_size ? `${project.team_size}` : 'TBD',
            memberCount: 1, // BACKEND TODO: Query project_members table for actual count
            spotsAvailable: project.team_size ? Math.max(0, project.team_size - 1) : 0,
            status: project.status,
          }))
        );

        setProjects(allProjects);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [classes]);

  // Group projects by class
  const groupedProjects: GroupedProjects[] = React.useMemo(() => {
    const grouped: Record<string, GroupedProjects> = {};

    projects.forEach((project) => {
      const classItem = classes.find((c: Class) => c.name === project.className);
      const classId = classItem?.id || project.className;

      if (!grouped[classId]) {
        grouped[classId] = {
          classId,
          className: project.className,
          courseCode: project.courseCode,
          projects: [],
        };
      }
      grouped[classId].projects.push(project);
    });

    return Object.values(grouped);
  }, [projects, classes]);

  // Filter projects by active/inactive status
  const filteredGroupedProjects = groupedProjects.map((group) => ({
    ...group,
    projects: group.projects.filter((project) =>
      showInactive ? project.status === 'inactive' : project.status === 'active'
    ),
  })).filter((group) => group.projects.length > 0);

  const sectionTitle = showInactive ? 'Inactive Projects' : 'Active Projects';

  // Handle project card click - navigate to project details
  const handleProjectClick = (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    const classItem = classes.find((c: Class) => c.name === project?.className);
    const courseId = classItem?.id || 'default';

    navigate(`/app/courses/${courseId}/projects/${projectId}`);
  };

  if (loading) {
    return (
      <div className="my-projects">
        <div className="my-projects__empty">
          <p>Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-projects">
        <div className="my-projects__empty">
          <p>Error loading projects: {error}</p>
        </div>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="my-projects">
        <div className="my-projects__empty">
          <p>You need to join a class first to see projects.</p>
        </div>
      </div>
    );
  }

  const hasProjects = filteredGroupedProjects.some((group) => group.projects.length > 0);

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

      {/* Projects Grouped by Class */}
      {!hasProjects ? (
        <h2 className="my-projects__section-title">{sectionTitle}</h2>
      ) : null}

      {filteredGroupedProjects.map((group) => (
        <div key={group.classId} className="my-projects__class-group">
          {/* Class Header */}
          <div className="my-projects__class-header">
            <h2 className="my-projects__class-name">
              {group.courseCode ? `${group.courseCode}: ` : ''}{group.className}
            </h2>
          </div>

          {/* Projects Grid */}
          <div className="my-projects__grid">
            {group.projects.map((project) => (
              <div
                key={project.id}
                className="project-card"
                onClick={() => handleProjectClick(project.id)}
                role="button"
                tabIndex={0}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleProjectClick(project.id);
                }}
              >
                {/* Card Header - Dark Grey */}
                <div className="project-card__header">
                  <h3 className="project-card__title">{project.title}</h3>
                  <p className="project-card__class-name">
                    {group.courseCode || group.className}
                  </p>
                </div>

                {/* Card Body - Light Grey */}
                <div className="project-card__body">
                  {/* BACKEND TODO: Replace with project.description from API */}
                  <p className="project-card__description">Project description</p>
                </div>

                {/* Card Footer - White */}
                <div className="project-card__footer">
                  <div className="project-card__owner-label">
                    {/* BACKEND TODO: Replace with project.owner_username from API */}
                    Owner: <span className="project-card__owner-name">username</span>
                  </div>
                  {/* FRONTEND TODO: Implement "See All" button functionality */}
                  <button className="project-card__see-all">See All</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Empty State */}
      {!hasProjects && (
        <div className="my-projects__empty">
          <p>No {showInactive ? 'inactive' : 'active'} projects available at the moment.</p>
        </div>
      )}
    </div>
  );
};

export default MyProjects;

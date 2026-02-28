import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ApiProject } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import ProjectView from '@features/app/components/Project/ProjectView';

const ProjectDetails: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { selectedClass } = useClass();
  const location = useLocation();
  const navigate = useNavigate();
  const [project, setProject] = useState<ApiProject | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setError('Missing project ID');
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchProject = async () => {
      try {
        setLoading(true);
        const response = await api.getProject(projectId);
        if (!isMounted) return;
        setProject(response.project);
        setError(null);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load project');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProject();

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Sync project name into location state so the header breadcrumb shows it (students and direct/refresh nav)
  useEffect(() => {
    if (!project || !location.pathname) return;
    const state = location.state as { projectName?: string } | null;
    if (state?.projectName === project.name) return;
    navigate(location.pathname, {
      state: { ...state, projectName: project.name },
      replace: true,
    });
  }, [project, location.pathname, location.state, navigate]);

  if (loading) {
    return (
      <div className="projects">
        <div className="projects__empty">
          <h2>Loading project...</h2>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="projects">
        <div className="projects__empty">
          <h2>Unable to load project</h2>
          {error && <p>{error}</p>}
        </div>
      </div>
    );
  }

  const className = selectedClass?.name ?? '';
  const teamSize =
    typeof project.team_size === 'number' && Number.isFinite(project.team_size)
      ? String(project.team_size)
      : undefined;
  const descriptionMarkdown = project.description ?? '';
  const skills = project.skills ?? [];
  const selectedRoles = project.looking_for_roles ?? [];

  return (
    <div className="projects">
      <ProjectView
        projectTitle={project.name}
        teamSize={teamSize}
        className={className}
        descriptionMarkdown={descriptionMarkdown}
        skills={skills}
        selectedRoles={selectedRoles}
      />
    </div>
  );
};

export default ProjectDetails;


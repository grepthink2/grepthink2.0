import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ApiProject, ApiProjectMember } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import ProjectView from '@features/app/components/Project/ProjectView';

const ProjectDetails: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const { selectedClass } = useClass();
  const location = useLocation();
  const navigate = useNavigate();
  const [project, setProject] = useState<ApiProject | null>(null);
  const [members, setMembers] = useState<ApiProjectMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setError('Missing project ID');
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [projectRes, membersRes] = await Promise.all([
          api.getProject(projectId),
          api.getProjectMembers(projectId).catch(() => ({ members: [] as ApiProjectMember[] })),
        ]);
        if (!isMounted) return;
        setProject(projectRes.project);
        setMembers(membersRes.members ?? []);
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

    fetchData();

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

  const refreshProjectAndMembers = useCallback(async () => {
    if (!projectId) return;
    try {
      const [projectRes, membersRes] = await Promise.all([
        api.getProject(projectId),
        api.getProjectMembers(projectId).catch(() => ({ members: [] as ApiProjectMember[] })),
      ]);
      setProject(projectRes.project);
      setMembers(membersRes.members ?? []);
    } catch {
      // keep current state
    }
  }, [projectId]);

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

  const projectRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Product Owner';
      case 'scrum_master':
        return 'Scrum Master';
      default:
        return role;
    }
  };

  const teamMembers = members.map((m) => ({
    id: m.user_id,
    displayName: 'Cole Saulnier',
    roleLabel: projectRoleLabel(m.project_role),
    email: m.email,
    githubUrl: undefined as string | undefined,
    linkedInUrl: undefined as string | undefined,
  }));

  return (
    <div className="projects">
      <ProjectView
        projectId={project.id}
        projectTitle={project.name}
        teamSize={teamSize}
        className={className}
        descriptionMarkdown={descriptionMarkdown}
        skills={skills}
        selectedRoles={selectedRoles}
        members={teamMembers}
        userRoleOnProject={project.user_role}
        classId={project.class_id}
        project={project}
        projectMembers={members}
        onMembersChange={refreshProjectAndMembers}
        onDelete={() => navigate('/app/browse-projects')}
        sponsorName={project.sponsor_name}
        sponsorCompany={project.sponsor_company}
        sponsorEmail={project.sponsor_email}
        sponsorWebsite={project.sponsor_website}
        sponsorDescription={project.sponsor_description}
      />
    </div>
  );
};

export default ProjectDetails;


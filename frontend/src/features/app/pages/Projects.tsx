import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ApiProject, ApiStudent } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import AddProjectButton from '@features/app/components/Project/AddProjectButton';
import AssignProjectsButton from '@features/app/components/Project/AssignProjectsButton';
import ProjectList, {
  type UiProject,
  type ProjectSentiment,
} from '@features/app/components/Project/ProjectList';
import ProjectMembershipChart from '@features/app/components/Stats/ProjectMembershipChart';
import ProjectHealth, {
  type ProjectHealthItem,
  type HealthStatus,
} from '@features/app/components/Stats/ProjectHealth';
import './Projects.scss';

const UNASSIGNED = 'Unassigned';

const SENTIMENT_TO_HEALTH: Record<ProjectSentiment, HealthStatus> = {
  positive: 'excellent',
  neutral: 'warning',
  negative: 'poor',
};

const HEALTH_DESCRIPTION: Record<ProjectSentiment, string> = {
  positive: 'Team sentiment is positive',
  neutral: 'Team sentiment is neutral',
  negative: 'Team sentiment is negative',
};

function normalizeSentiment(raw: string | null | undefined): ProjectSentiment {
  if (raw === 'positive' || raw === 'neutral' || raw === 'negative') {
    return raw;
  }
  return 'neutral';
}

function mapApiProjectToUi(project: ApiProject): UiProject {
  return {
    id: project.id,
    name: project.name,
    students: project.member_count ?? 0,
    poName: project.product_owner_name?.trim() || UNASSIGNED,
    poEmail: project.product_owner_email ?? '',
    smName: project.scrum_master_name?.trim() || UNASSIGNED,
    smEmail: project.scrum_master_email ?? '',
    sentiment: normalizeSentiment(project.sentiment ?? undefined),
  };
}

function buildProjectHealth(apiProjects: ApiProject[]): ProjectHealthItem[] {
  const severityOrder: Record<ProjectSentiment, number> = {
    negative: 0,
    neutral: 1,
    positive: 2,
  };

  return apiProjects
    .filter((p) => p.sentiment)
    .map((p) => {
      const sentiment = normalizeSentiment(p.sentiment);
      return {
        order: severityOrder[sentiment],
        item: {
          id: p.id,
          name: p.name,
          health: SENTIMENT_TO_HEALTH[sentiment],
          description: HEALTH_DESCRIPTION[sentiment],
          via: 'Team Sentiment',
        },
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function countProjectMembership(students: ApiStudent[]) {
  const enrolledStudents = students.filter((s) => s.role !== 'instructor');
  const inProject = enrolledStudents.filter((s) => s.project_id).length;
  return {
    inProject,
    notInProject: enrolledStudents.length - inProject,
  };
}

const Projects: React.FC = () => {
  const { selectedClass } = useClass();
  const navigate = useNavigate();
  const [apiProjects, setApiProjects] = useState<ApiProject[]>([]);
  const [classStudents, setClassStudents] = useState<ApiStudent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const projects = useMemo(
    () => apiProjects.map(mapApiProjectToUi),
    [apiProjects],
  );

  const projectHealth = useMemo(
    () => buildProjectHealth(apiProjects),
    [apiProjects],
  );

  const membershipStats = useMemo(
    () => countProjectMembership(classStudents),
    [classStudents],
  );

  useEffect(() => {
    if (!selectedClass) {
      setLoading(false);
      setApiProjects([]);
      setClassStudents([]);
      setError(null);
      return;
    }

    let isMounted = true;

    const fetchProjectsPageData = async () => {
      try {
        setLoading(true);
        const [projectsResponse, studentsResponse] = await Promise.all([
          api.getClassProjects(selectedClass.id),
          api.getClassStudents(selectedClass.id),
        ]);
        if (!isMounted) return;

        setApiProjects(projectsResponse.projects ?? []);
        setClassStudents(studentsResponse.students ?? []);
        setError(null);
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load projects');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchProjectsPageData();

    return () => {
      isMounted = false;
    };
  }, [selectedClass]);

  if (!selectedClass) {
    return (
      <div className="projects">
        <div className="projects__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view projects.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="projects">
      <div className="projects__layout">
        <div className="projects__main">
          <div className="projects__header">
            <div className="projects__header-actions">
              <AddProjectButton />
              <AssignProjectsButton />
            </div>
          </div>

          <ProjectList
            projects={projects}
            loading={loading}
            error={error}
            onProjectClick={(project) =>
              navigate(`/app/projects/${project.id}`, {
                state: { projectName: project.name },
              })
            }
          />
        </div>

        <div className="projects__stats">
          <ProjectMembershipChart
            inProject={membershipStats.inProject}
            notInProject={membershipStats.notInProject}
          />
          <ProjectHealth projects={projectHealth} />
        </div>
      </div>
    </div>
  );
};

export default Projects;

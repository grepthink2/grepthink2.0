import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ApiProject, ApiRosterStudent } from '@/lib/api';
import { useClass, type Class } from '@/lib/classContext';
import AddProjectButton from '@features/app/components/Project/AddProjectButton';
import AssignProjectsButton from '@features/app/components/Project/AssignProjectsButton';
import ProjectList, {
  type UiProject,
  type ProjectSentiment,
} from '@features/app/components/Project/ProjectList';
import ProjectMembershipChart from '@features/app/components/Stats/ProjectMembershipChart';
import './Projects.scss';

const UNASSIGNED = 'Unassigned';

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

function countProjectMembership(students: ApiRosterStudent[]) {
  // TAs and dropped students are excluded from project assignment counts.
  const countable = students.filter(
    (s) => s.enrollment_role !== 'ta' && s.class_status !== 'dropped',
  );
  const inProject = countable.filter((s) => s.projects.length > 0).length;
  const registeredNoProject = countable.filter(
    (s) => s.projects.length === 0 && s.grepthink_status === 'registered',
  ).length;
  const notRegistered = countable.filter((s) => s.grepthink_status === 'not_registered').length;
  return { inProject, registeredNoProject, notRegistered };
}

/** The last completed load, and the class object it was made for. */
interface ProjectsPageLoad {
  forClass: Class;
  apiProjects: ApiProject[];
  classStudents: ApiRosterStudent[];
  error: string | null;
}

const NO_PROJECTS: ApiProject[] = [];
const NO_STUDENTS: ApiRosterStudent[] = [];

const Projects: React.FC = () => {
  const { selectedClass } = useClass();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState<ProjectsPageLoad | null>(null);

  // The last load's rows and roster stay on screen while another class loads.
  const apiProjects = loaded?.apiProjects ?? NO_PROJECTS;
  const classStudents = loaded?.classStudents ?? NO_STUDENTS;
  const loading = selectedClass !== null && loaded?.forClass !== selectedClass;
  const error = loaded?.error ?? null;

  const projects = useMemo(
    () => apiProjects.map(mapApiProjectToUi),
    [apiProjects],
  );

  const membershipStats = useMemo(
    () => countProjectMembership(classStudents),
    [classStudents],
  );

  useEffect(() => {
    if (!selectedClass) return;

    let isMounted = true;

    const fetchProjectsPageData = async () => {
      try {
        const [overview, rosterResponse] = await Promise.all([
          api.getClassProjectsOverview(selectedClass.id),
          api.getClassRoster(selectedClass.id),
        ]);
        if (!isMounted) return;

        setLoaded({
          forClass: selectedClass,
          apiProjects: overview.projects ?? [],
          classStudents: rosterResponse.students ?? [],
          error: null,
        });
      } catch (err) {
        if (isMounted) {
          const message = err instanceof Error ? err.message : 'Failed to load projects';
          // A failed load keeps the previous rows and roster.
          setLoaded((prev) => ({
            forClass: selectedClass,
            apiProjects: prev?.apiProjects ?? [],
            classStudents: prev?.classStudents ?? [],
            error: message,
          }));
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
            key={selectedClass?.id}
            projects={projects}
            loading={loading}
            error={error}
            onProjectClick={(project) =>
              navigate(`/app/projects/${project.id}`, {
                state: { projectName: project.name },
              })
            }
            onPreviewMember={(project) =>
              // Navigate to the (shared) detail route first, then let
              // ProjectDetails flip into preview — entering preview while still
              // on the instructor-only list path would bounce us to Home.
              navigate(`/app/projects/${project.id}`, {
                state: { projectName: project.name, previewAsMember: true },
              })
            }
          />
        </div>

        <div className="projects__stats">
          <ProjectMembershipChart
            inProject={membershipStats.inProject}
            registeredNoProject={membershipStats.registeredNoProject}
            notRegistered={membershipStats.notRegistered}
          />
          {/* <ProjectHealth projects={projectHealth} /> */}
          <div className="project-health">
            <h3 className="project-health__heading">Project Health</h3>
            <div className="project-health__coming-soon">
              <p>Coming Soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Projects;

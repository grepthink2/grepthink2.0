import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ApiProject } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import AddProjectButton from '@features/app/components/Project/AddProjectButton';
import ProjectList, {
  type UiProject,
  type ProjectSentiment,
} from '@features/app/components/Project/ProjectList';
import AssignmentTurnInRate, {
  type TurnInRateData,
} from '@features/app/components/Stats/AssignmentTurnInRate';
import ProjectHealth, {
  type ProjectHealthItem,
} from '@features/app/components/Stats/ProjectHealth';
import './Projects.scss';

const mockTurnInRate: TurnInRateData = {
  rate: 69,
  teamsSubmitted: { count: 18, total: 26 },
  partialSubmissions: { count: 5, total: 26 },
  currentAssignment: 'Team Status Report 1',
  dueDate: 'Jan 30, 2026',
};

const mockProjectHealth: ProjectHealthItem[] = [
  {
    id: '1',
    name: 'ShoeShopper',
    health: 'excellent',
    description: 'Excellent collaboration and progress on schedule',
    via: 'Team Status Report 1',
  },
  {
    id: '2',
    name: 'Chatcut',
    health: 'warning',
    description: 'Minor disagreements on tech stack decisions',
    via: 'Team Status Report 1',
  },
  {
    id: '3',
    name: 'TaskMaster',
    health: 'poor',
    description: 'Significant delays and communication breakdowns',
    via: 'Team Status Report 2',
  },
];

const MOCK_POS = [
  { name: 'John D', email: 'johnd@ucsc.edu' },
  { name: 'Jane D', email: 'janed@ucsc.edu' },
];

const MOCK_SMS = [
  { name: 'John B', email: 'johnb@ucsc.edu' },
  { name: 'Jane B', email: 'janeb@ucsc.edu' },
];

const MOCK_STUDENTS = [6, 5, 4, 6, 7];
const MOCK_SENTIMENTS: ProjectSentiment[] = ['positive', 'negative', 'neutral', 'negative'];

const buildUiProject = (project: ApiProject, index: number): UiProject => {
  const po = MOCK_POS[index % MOCK_POS.length];
  const sm = MOCK_SMS[index % MOCK_SMS.length];
  const students = MOCK_STUDENTS[index % MOCK_STUDENTS.length];
  const sentiment = MOCK_SENTIMENTS[index % MOCK_SENTIMENTS.length];

  return {
    id: project.id,
    name: project.name,
    students,
    poName: po.name,
    poEmail: po.email,
    smName: sm.name,
    smEmail: sm.email,
    sentiment,
  };
};

const Projects: React.FC = () => {
  const { selectedClass } = useClass();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<UiProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedClass) {
      setLoading(false);
      setProjects([]);
      setError(null);
      return;
    }

    let isMounted = true;

    const fetchProjects = async () => {
      try {
        setLoading(true);
        const response = await api.getClassProjects(selectedClass.id);
        if (!isMounted) return;
        const uiProjects = response.projects.map(buildUiProject);
        setProjects(uiProjects);
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

    fetchProjects();

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
        {/* Left: table and actions */}
        <div className="projects__main">
          <div className="projects__header">
            <div className="projects__header-actions">
              <AddProjectButton />
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

        {/* Right: stats column */}
        <div className="projects__stats">
          <AssignmentTurnInRate data={mockTurnInRate} />
          <ProjectHealth projects={mockProjectHealth} />
        </div>
      </div>
    </div>
  );
};

export default Projects;


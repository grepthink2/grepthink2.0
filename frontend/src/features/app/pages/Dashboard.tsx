import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FolderKanban,
  UserX,
  Users,
} from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { ApiAssignment, ApiProject, ApiRosterStudent } from '@/lib/api';
import { useClassTurnInStats } from '@features/app/hooks/useClassTurnInStats';
import ProjectHealth from '@features/app/components/Stats/ProjectHealth';
import DashboardMetricCard from '@features/app/components/Dashboard/DashboardMetricCard';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import {
  buildProjectHealth,
  recentAssignments,
  summarizeRoster,
  type AssignmentStatus,
} from '@features/app/components/Dashboard/dashboardData';
import './Dashboard.scss';

const STATUS_PILL_LABEL: Record<AssignmentStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
};

const Dashboard: React.FC = () => {
  const { selectedClass } = useClass();
  const navigate = useNavigate();
  const { turnInRate, stats: turnInStats } = useClassTurnInStats(selectedClass?.id);

  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [assignments, setAssignments] = useState<ApiAssignment[]>([]);
  const [roster, setRoster] = useState<ApiRosterStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classId = selectedClass?.id;

  useEffect(() => {
    if (!classId) {
      setProjects([]);
      setAssignments([]);
      setRoster([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [projectsRes, assignmentsRes, rosterRes] = await Promise.all([
          api.getProjects(classId).catch(() => ({ projects: [] as ApiProject[] })),
          api.getAssignments(classId).catch(() => ({ assignments: [] as ApiAssignment[] })),
          api
            .getClassRoster(classId)
            .catch(() => ({ students: [] as ApiRosterStudent[], uploaded_at: null })),
        ]);
        if (cancelled) return;
        setProjects(projectsRes.projects ?? []);
        setAssignments(assignmentsRes.assignments ?? []);
        setRoster(rosterRes.students ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const rosterSummary = useMemo(() => summarizeRoster(roster), [roster]);
  const projectHealth = useMemo(() => buildProjectHealth(projects), [projects]);
  const recentRows = useMemo(() => recentAssignments(assignments, 5), [assignments]);

  const studentsRegistered = selectedClass?.enrolled_count ?? 0;
  const activeProjects = projects.length;

  const submitted = turnInStats?.teamsSubmitted.count ?? 0;
  const submittedTotal = turnInStats?.teamsSubmitted.total ?? 0;
  const submittedPct =
    submittedTotal > 0 ? Math.round((submitted / submittedTotal) * 100) : 0;

  if (!selectedClass) {
    return (
      <div className="dashboard">
        <div className="dashboard__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view the dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {error && <div className="dashboard__inline-error">{error}</div>}

      <section className="dashboard__metrics" aria-label="Class metrics">
        <DashboardMetricCard
          label="Registered Students"
          value={studentsRegistered}
          icon={Users}
          accent="primary"
          tooltip="Students registered in GrepThink"
          loading={loading}
          onClick={() => navigate('/app/roster')}
        />
        <DashboardMetricCard
          label="Active Projects"
          value={activeProjects}
          icon={FolderKanban}
          accent="blue"
          loading={loading}
          onClick={() => navigate('/app/projects')}
        />
        <DashboardMetricCard
          label="Turn-In Rate"
          value={`${turnInRate.rate}%`}
          icon={FileCheck2}
          accent="primary"
          onClick={() => navigate('/app/modules')}
        />
        <DashboardMetricCard
          label="Not On Roster"
          value={rosterSummary.notOnRoster}
          icon={UserX}
          accent="amber"
          hint={rosterSummary.notOnRoster > 0 ? 'Registered but unmatched' : 'All matched'}
          loading={loading}
          onClick={() => navigate('/app/roster')}
        />
      </section>

      <section className="dashboard__content">
        {/* Primary: assignments */}
        <div className="dashboard__card dashboard__card--assignments">
          <div className="dashboard__card-header">
            <span className="dashboard__card-title">
              <ClipboardList size={18} aria-hidden /> Assignments
            </span>
            <button
              type="button"
              className="dashboard__card-link"
              onClick={() => navigate('/app/modules')}
            >
              All modules <ChevronRight size={16} aria-hidden />
            </button>
          </div>
          {loading ? (
            <ul className="dashboard__assignment-list" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <li key={i} className="dashboard__assignment-row">
                  <div className="dashboard__assignment-text">
                    <Skeleton width="55%" height={13} />
                    <Skeleton width="35%" height={11} />
                  </div>
                  <div className="dashboard__assignment-end">
                    <Skeleton width={64} height={20} radius={20} />
                  </div>
                </li>
              ))}
            </ul>
          ) : recentRows.length === 0 ? (
            <p className="dashboard__card-empty">No assignments yet.</p>
          ) : (
            <ul className="dashboard__assignment-list">
              {recentRows.map((a) => {
                const isTsr =
                  a.assignmentType !== 'interest_form' && a.assignmentType !== 'feedback';
                const canViewTsr = isTsr && a.hasTsrResponses;
                const isFeedback = a.assignmentType === 'feedback';
                const canViewFeedback = isFeedback && a.hasFeedbackResponses;
                const canView = canViewTsr || canViewFeedback;

                const handleTitleClick = () => {
                  if (canViewTsr) {
                    navigate(`/app/modules/tsr/${a.id}`, {
                      state: { assignmentName: a.title },
                    });
                  } else if (canViewFeedback) {
                    navigate(`/app/modules/feedback/${a.id}`, {
                      state: { assignmentName: a.title },
                    });
                  }
                };

                return (
                  <li key={a.id} className="dashboard__assignment-row">
                    <div className="dashboard__assignment-text">
                      {canView ? (
                        <button
                          type="button"
                          className="dashboard__assignment-title-link"
                          onClick={handleTitleClick}
                        >
                          {a.title}
                        </button>
                      ) : (
                        <span className="dashboard__assignment-title">{a.title}</span>
                      )}
                      <span className="dashboard__assignment-due">Due {a.dueLabel}</span>
                    </div>
                    <div className="dashboard__assignment-end">
                      {a.total > 0 && (
                        <span className="dashboard__assignment-count">
                          {a.submitted}/{a.total}
                        </span>
                      )}
                      <span className={`dashboard__pill dashboard__pill--${a.status}`}>
                        {STATUS_PILL_LABEL[a.status]}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Aside: TSR summary + project health */}
        <div className="dashboard__aside">
          <div className="dashboard__card">
            <div className="dashboard__card-header">
              <span className="dashboard__card-title">
                <FileCheck2 size={18} aria-hidden /> TSR Summary
              </span>
              <button
                type="button"
                className="dashboard__card-link"
                onClick={() => navigate('/app/modules')}
              >
                View <ChevronRight size={16} aria-hidden />
              </button>
            </div>
            <div className="dashboard__tsr">
              <span className="dashboard__tsr-num">
                {submitted}
                <span className="dashboard__tsr-total">/{submittedTotal}</span>
              </span>
              <span className="dashboard__tsr-label">teams submitted</span>
            </div>
            <div className="dashboard__progress">
              <div
                className="dashboard__progress-fill"
                style={{ width: `${submittedPct}%` }}
              />
            </div>
            <div className="dashboard__tsr-meta">
              <span className="dashboard__tsr-current">{turnInRate.currentAssignment}</span>
              <span className="dashboard__tsr-due">Due {turnInRate.dueDate}</span>
            </div>
          </div>

          <div className="dashboard__card dashboard__card--health">
            <div className="dashboard__card-header">
              <span className="dashboard__card-title">
                <FolderKanban size={18} aria-hidden /> Project Health
              </span>
              <button
                type="button"
                className="dashboard__card-link"
                onClick={() => navigate('/app/projects')}
              >
                View all <ChevronRight size={16} aria-hidden />
              </button>
            </div>
            {projectHealth.length === 0 ? (
              <p className="dashboard__card-empty">
                Sentiment appears once teams submit status reports.
              </p>
            ) : (
              <div className="dashboard__health-scroll">
                <ProjectHealth
                  projects={projectHealth}
                  onDetails={() => navigate('/app/projects')}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;

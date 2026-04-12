import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  Clock,
  FolderOpen,
  MessageCircle,
} from 'lucide-react';
import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns';
import { useClass } from '@/lib/classContext';
import { useUser } from '@/lib/auth';
import { api, type ApiAssignment } from '@/lib/api';
import type { AppOutletContext } from '@/features/app/appOutletContext';
import {
  MOCK_JOIN_REQUESTS,
  MOCK_SCHEDULE,
  buildFallbackDeadlineRows,
  type MockJoinRequest,
} from './mockData';
import './StudentHomeDashboard.scss';

type DeadlineDisplayStatus = 'due_soon' | 'not_started' | 'in_progress';

interface DeadlineRow {
  id: string;
  name: string;
  courseLabel: string;
  dueLabel: string;
  status: DeadlineDisplayStatus;
  projectId?: string;
  projectName?: string;
  highlight: boolean;
}

interface TeamMemberRow {
  userId: string;
  initials: string;
  displayName: string;
  roleLabel: string;
  presence: 'green' | 'orange' | 'gray' | 'none';
  avatarClassIndex: number;
}

function courseLabelFromClass(selected: {
  name: string;
  description?: string;
  term?: string;
  year?: number;
}): string {
  const parts = [selected.year ? String(selected.year) : '', selected.term, selected.name].filter(
    Boolean,
  );
  return parts.join(' ').trim() || selected.name;
}

/** YYYY-MM-DD from API datetime (avoids UTC day-shift when formatting). */
function assignmentDatePart(iso: string): string {
  return iso.trim().split('T')[0];
}

/** Local calendar date for assignment open/close (matches the due date shown). */
function parseLocalAssignmentDate(iso: string): Date {
  const datePart = assignmentDatePart(iso);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (match) {
    const y = Number(match[1]);
    const m = Number(match[2]) - 1;
    const d = Number(match[3]);
    return new Date(y, m, d);
  }
  return parseISO(iso);
}

/** Display string for assignment due date in the user’s local calendar. */
function formatDueLabel(closeDate: string): string {
  return format(parseLocalAssignmentDate(closeDate), 'MMM d, yyyy');
}

function initialsFromEmail(email: string | undefined): string {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  const tokens = local.split(/[._-]+/).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || '?';
}

function displayNameFromEmail(email: string | undefined): string {
  if (!email) return 'Member';
  const local = email.split('@')[0] ?? 'Member';
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function computeDeadlineStatus(params: {
  assignment: ApiAssignment;
  allPairsSubmitted: boolean;
  anySubmitted: boolean;
}): DeadlineDisplayStatus | null {
  if (params.allPairsSubmitted) return null;

  const today = startOfDay(new Date());
  const closeDay = startOfDay(parseLocalAssignmentDate(params.assignment.close_date));
  const openDay = startOfDay(parseLocalAssignmentDate(params.assignment.open_date));
  const daysToClose = differenceInCalendarDays(closeDay, today);

  if (daysToClose < 0) {
    return 'due_soon';
  }
  if (daysToClose <= 7) {
    return 'due_soon';
  }
  if (params.anySubmitted && !params.allPairsSubmitted) {
    return 'in_progress';
  }
  if (openDay <= today && today <= closeDay) {
    return 'in_progress';
  }
  return 'not_started';
}

function buildDeadlineRows(
  assignments: ApiAssignment[],
  myClassProjects: { id: string; name: string }[],
  tsrsByProject: Record<string, string[]>,
  courseLabel: string,
): DeadlineRow[] {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  type Internal = DeadlineRow & { closeMs: number };
  const rows: Internal[] = [];

  for (const a of assignments) {
    if (myClassProjects.length === 0) {
      const allPairsSubmitted = false;
      const anySubmitted = false;
      const st = computeDeadlineStatus({
        assignment: a,
        allPairsSubmitted,
        anySubmitted,
      });
      if (st === null) continue;
      if (assignmentDatePart(a.close_date) < todayStr) continue;
      rows.push({
        id: a.id,
        name: a.Title,
        courseLabel,
        dueLabel: formatDueLabel(a.close_date),
        status: st,
        highlight: false,
        closeMs: parseLocalAssignmentDate(a.close_date).getTime(),
      });
      continue;
    }

    const submittedFlags = myClassProjects.map((p) =>
      (tsrsByProject[p.id] ?? []).includes(a.id),
    );
    const allPairsSubmitted = submittedFlags.every(Boolean);
    const anySubmitted = submittedFlags.some(Boolean);
    const st = computeDeadlineStatus({ assignment: a, allPairsSubmitted, anySubmitted });
    if (st === null) continue;

    const pickProjectIdx = submittedFlags.findIndex((s) => !s);
    const projIdx = pickProjectIdx >= 0 ? pickProjectIdx : 0;
    const proj = myClassProjects[projIdx];

    if (assignmentDatePart(a.close_date) < todayStr && allPairsSubmitted) continue;

    rows.push({
      id: a.id,
      name: a.Title,
      courseLabel,
      dueLabel: formatDueLabel(a.close_date),
      status: st,
      projectId: proj.id,
      projectName: proj.name,
      highlight: false,
      closeMs: parseLocalAssignmentDate(a.close_date).getTime(),
    });
  }

  rows.sort((x, y) => x.closeMs - y.closeMs);

  const firstInProgress = rows.findIndex((r) => r.status === 'in_progress');
  if (firstInProgress >= 0) {
    rows[firstInProgress] = { ...rows[firstInProgress], highlight: true };
  }

  return rows.slice(0, 12).map(({ closeMs, ...row }) => row);
}

const statusLabel: Record<DeadlineDisplayStatus, string> = {
  due_soon: 'Due Soon',
  not_started: 'Not Started',
  in_progress: 'In Progress',
};

const statusPillClass: Record<DeadlineDisplayStatus, string> = {
  due_soon: 'student-home__pill--due-soon',
  not_started: 'student-home__pill--not-started',
  in_progress: 'student-home__pill--in-progress',
};

const StudentHomeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { openJoinClassModal } = useOutletContext<AppOutletContext>();
  const { selectedClass } = useClass();
  const { user } = useUser();

  const [deadlineRows, setDeadlineRows] = useState<DeadlineRow[]>([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [teamProjectName, setTeamProjectName] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);

  const [requestItems, setRequestItems] = useState<MockJoinRequest[]>(() =>
    MOCK_JOIN_REQUESTS.map((r) => ({ ...r })),
  );

  const useMockDeadlines = !selectedClass;
  const displayDeadlines = useMockDeadlines
    ? buildFallbackDeadlineRows('Select a class to see your course').map((d) => ({
        id: d.id,
        name: d.name,
        courseLabel: d.courseLabel,
        dueLabel: d.dueLabel,
        status: d.status,
        highlight: Boolean(d.highlight),
        isMock: true as const,
      }))
    : deadlineRows.map((d) => ({ ...d, isMock: false as const }));

  const showEmptyDeadlines =
    Boolean(selectedClass) && !deadlinesLoading && deadlineRows.length === 0;

  useEffect(() => {
    if (!selectedClass) {
      setDeadlineRows([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setDeadlinesLoading(true);
      try {
        const { assignments } = await api.getAssignments(selectedClass.id);
        const { projects: myAllProjects } = await api.getProjects();
        const { projects: classProjects } = await api.getProjects(selectedClass.id);

        const myProjectIds = new Set(myAllProjects.map((p) => p.id));
        const myClassProjects = classProjects
          .filter((p) => myProjectIds.has(p.id))
          .map((p) => ({ id: p.id, name: p.name }));

        const tsrsByProject: Record<string, string[]> = {};
        await Promise.all(
          myClassProjects.map(async (p) => {
            try {
              const { tsrs } = await api.getProjectTsrs(p.id);
              tsrsByProject[p.id] = tsrs
                .map((t) => t.assignment_id)
                .filter((id): id is string => Boolean(id));
            } catch {
              tsrsByProject[p.id] = [];
            }
          }),
        );

        if (cancelled) return;

        const cl = courseLabelFromClass(selectedClass);
        const rows = buildDeadlineRows(assignments, myClassProjects, tsrsByProject, cl);
        setDeadlineRows(rows);
      } catch {
        if (!cancelled) setDeadlineRows([]);
      } finally {
        if (!cancelled) setDeadlinesLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.id, selectedClass?.name, selectedClass?.description, selectedClass?.term, selectedClass?.year]);

  useEffect(() => {
    if (!selectedClass) {
      setTeamMembers([]);
      setTeamProjectName(null);
      return;
    }

    let cancelled = false;

    const loadTeam = async () => {
      setTeamLoading(true);
      try {
        const { projects: myAllProjects } = await api.getProjects();
        const { projects: classProjects } = await api.getProjects(selectedClass.id);
        const myIds = new Set(myAllProjects.map((p) => p.id));
        const mineInClass = classProjects.filter((p) => myIds.has(p.id));

        if (cancelled) return;

        if (mineInClass.length !== 1) {
          setTeamMembers([]);
          setTeamProjectName(null);
          return;
        }

        const project = mineInClass[0];
        const { members } = await api.getProjectMembers(project.id);
        if (cancelled) return;

        const presenceCycle: Array<'green' | 'orange' | 'gray' | 'none'> = [
          'green',
          'green',
          'orange',
          'gray',
          'none',
        ];

        const rows: TeamMemberRow[] = members.map((m, i) => ({
          userId: m.user_id,
          initials: initialsFromEmail(m.email),
          displayName: displayNameFromEmail(m.email),
          roleLabel: m.project_role || 'Member',
          presence: presenceCycle[i % presenceCycle.length],
          avatarClassIndex: i % 5,
        }));

        setTeamProjectName(project.name);
        setTeamMembers(rows);
      } catch {
        if (!cancelled) {
          setTeamMembers([]);
          setTeamProjectName(null);
        }
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    };

    loadTeam();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.id]);

  const handleDeadlineNavigate = useCallback(
    (row: (typeof displayDeadlines)[number]) => {
      if ('isMock' in row && row.isMock) return;
      const r = row as DeadlineRow & { isMock?: boolean };
      navigate(`/app/assignments/${r.id}`, {
        state: {
          assignmentName: r.name,
          assignmentType: 'tsrs',
          dueDate: r.dueLabel,
          projectName: r.projectName ?? '—',
          projectId: r.projectId,
        },
      });
    },
    [navigate],
  );

  const removeRequest = (id: string) => {
    setRequestItems((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="student-home">
      <div className="student-home__grid">
        <div className="student-home__column student-home__column--main">
          <section
            className="student-home__card student-home__card--deadlines"
            aria-labelledby="deadlines-heading"
          >
            <div className="student-home__card-header">
              <h2 id="deadlines-heading" className="student-home__card-title">
                Upcoming Deadlines
              </h2>
            </div>
            {deadlinesLoading && selectedClass ? (
              <p className="student-home__loading">Loading deadlines…</p>
            ) : (
              <div className="student-home__deadlines-scroll">
                <table className="student-home__deadlines-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Deadline</th>
                      <th>Status</th>
                      <th className="student-home__chevron" aria-hidden />
                    </tr>
                  </thead>
                  <tbody>
                    {showEmptyDeadlines ? (
                      <tr>
                        <td colSpan={4} className="student-home__deadlines-empty">
                          No upcoming deadlines.
                        </td>
                      </tr>
                    ) : (
                      displayDeadlines.map((row) => {
                        const isMock = 'isMock' in row && row.isMock;
                        const status = row.status;
                        return (
                          <tr
                            key={row.id}
                            className={`student-home__deadline-row${row.highlight ? ' student-home__deadline-row--highlight' : ''}`}
                            tabIndex={isMock ? -1 : 0}
                            role={isMock ? undefined : 'button'}
                            onClick={() => !isMock && handleDeadlineNavigate(row)}
                            onKeyDown={(e) => {
                              if (!isMock && (e.key === 'Enter' || e.key === ' ')) {
                                e.preventDefault();
                                handleDeadlineNavigate(row);
                              }
                            }}
                          >
                            <td>
                              <span className="student-home__deadline-name">{row.name}</span>
                              <span className="student-home__deadline-course">{row.courseLabel}</span>
                            </td>
                            <td className="student-home__deadline-date">{row.dueLabel}</td>
                            <td>
                              <span className={`student-home__pill ${statusPillClass[status]}`}>
                                {statusLabel[status]}
                              </span>
                            </td>
                            <td className="student-home__chevron">
                              {!isMock && <ChevronRight size={18} aria-hidden />}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="student-home__card" aria-labelledby="requests-heading">
            <div className="student-home__card-header">
              <h2 id="requests-heading" className="student-home__card-title">
                Requests
              </h2>
              <button type="button" className="student-home__link">
                See All
              </button>
            </div>
            <div className="student-home__requests-list">
              {requestItems.map((req) => (
                <div key={req.id} className="student-home__request-card">
                  <div className="student-home__request-top">
                    <div
                      className="student-home__avatar"
                      style={{ backgroundColor: req.avatarBg }}
                    >
                      {req.avatarInitials}
                    </div>
                    <div className="student-home__request-main">
                      <h3 className="student-home__request-title">{req.projectName}</h3>
                      <p className="student-home__request-sub">{req.subtext}</p>
                      <div className="student-home__badges">
                        {req.badges.map((b) => (
                          <span
                            key={b.label}
                            className={`student-home__badge${b.variant === 'purple' ? ' student-home__badge--purple' : ''}`}
                          >
                            {b.label}
                          </span>
                        ))}
                      </div>
                      {req.awaitingMeta ? (
                        <div className="student-home__awaiting">
                          <Clock size={14} aria-hidden />
                          {req.awaitingMeta}
                        </div>
                      ) : (
                        <div className="student-home__request-actions">
                          <button
                            type="button"
                            className="student-home__btn-accept"
                            onClick={() => removeRequest(req.id)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="student-home__btn-deny"
                            onClick={() => removeRequest(req.id)}
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {requestItems.length === 0 && (
                <p className="student-home__empty">No pending requests.</p>
              )}
            </div>
          </section>
        </div>

        <div className="student-home__column student-home__column--aside">
          <div className="student-home__toolbar" role="toolbar" aria-label="Quick actions">
            <button
              type="button"
              className="student-home__toolbar-btn student-home__toolbar-btn--join"
              aria-label="Join a class with course code"
              onClick={() => openJoinClassModal()}
            >
              <BookOpen size={16} aria-hidden />
              Join Class
            </button>
            <button
              type="button"
              className="student-home__toolbar-btn student-home__toolbar-btn--messages"
              aria-label="Open messages"
              onClick={() => navigate('/app/messages')}
            >
              <MessageCircle size={16} aria-hidden />
              Messages
            </button>
            <button
              type="button"
              className="student-home__toolbar-btn student-home__toolbar-btn--browse"
              aria-label="Browse class projects"
              onClick={() => navigate('/app/browse-projects')}
            >
              <FolderOpen size={16} aria-hidden />
              Browse
            </button>
          </div>

          <section className="student-home__card" aria-labelledby="schedule-heading">
            <div className="student-home__card-header">
              <h2 id="schedule-heading" className="student-home__card-title">
                Today&apos;s Schedule
              </h2>
            </div>
            <ul className="student-home__schedule-list">
              {MOCK_SCHEDULE.map((item) => (
                <li key={item.id} className="student-home__schedule-item">
                  <span className="student-home__schedule-time">{item.timeLabel}</span>
                  <div className="student-home__schedule-body">
                    <span
                      className={`student-home__schedule-dot student-home__schedule-dot--${item.accent}`}
                    />
                    <div>
                      <p className="student-home__schedule-title">{item.title}</p>
                      <p className="student-home__schedule-sub">{item.subtitle}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="student-home__card" aria-labelledby="team-heading">
            <div className="student-home__card-header">
              <h2 id="team-heading" className="student-home__card-title">
                Your team
              </h2>
              {teamProjectName && (
                <span className="student-home__team-project">{teamProjectName}</span>
              )}
            </div>
            {teamLoading ? (
              <p className="student-home__loading">Loading team…</p>
            ) : teamMembers.length === 0 ? (
              <p className="student-home__empty">
                {selectedClass
                  ? 'Join a project in this class to see your teammates here.'
                  : 'Select a class and join a project to see your team.'}
              </p>
            ) : (
              <ul className="student-home__team-list">
                {teamMembers.map((m) => {
                  const isYou = user?.id === m.userId;
                  return (
                    <li key={m.userId} className="student-home__team-item">
                      <div className="student-home__team-avatar-wrap">
                        <div
                          className={`student-home__team-avatar student-home__team-avatar--${m.avatarClassIndex}`}
                        >
                          {m.initials}
                        </div>
                        {m.presence !== 'none' && (
                          <span
                            className={`student-home__status-dot student-home__status-dot--${m.presence}`}
                          />
                        )}
                      </div>
                      <div className="student-home__team-text">
                        <span className="student-home__team-name">
                          {m.displayName}
                          {isYou && <span className="student-home__you">(You)</span>}
                        </span>
                        <span className="student-home__team-role">{m.roleLabel}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <button
        type="button"
        className="student-home__fab"
        aria-label="Help center"
        onClick={() => navigate('/app/help-center')}
      >
        ?
      </button>
    </div>
  );
};

export default StudentHomeDashboard;

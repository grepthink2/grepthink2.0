import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  FolderOpen,
  Loader2,
  MessageCircle,
  X,
} from 'lucide-react';
import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfDay,
} from 'date-fns';
import { formatAssignmentDueDate } from '@/lib/dateUtils';
import { useClass } from '@/lib/classContext';
import { useUser } from '@/lib/auth';
import { emptyMySubmissions, api, type ApiAssignment } from '@/lib/api';
import {
  avatarBgFromEmail,
  displayNameFromEmail,
  formatAwaitingMeta,
  formatRequestedMeta,
  incomingRowsFromApi,
  initialsFromEmail,
  outgoingRowsFromApi,
  type IncomingRequestRow,
  type OutgoingRequestRow,
} from '@/features/app/utils/joinRequests';
import type { AppOutletContext } from '@/features/app/appOutletContext';
import {
  // MOCK_SCHEDULE,
  // buildFallbackDeadlineRows,
} from './mockData';
import RequestsModal from './RequestsModal';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './StudentHomeDashboard.scss';

type DeadlineDisplayStatus = 'due_soon' | 'not_started' | 'in_progress' | 'completed';

interface DeadlineRow {
  id: string;
  name: string;
  courseLabel: string;
  dueLabel: string;
  status: DeadlineDisplayStatus;
  projectId?: string;
  projectName?: string;
  highlight: boolean;
  assignmentType?: string;
}

interface TeamMemberRow {
  userId: string;
  initials: string;
  displayName: string;
  roleLabel: string;
  presence: 'green' | 'orange' | 'gray' | 'none';
  avatarClassIndex: number;
  avatarUrl?: string;
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

/** Display string for assignment due date, pinned to 11:59 PM PST → local time. */
function formatDueLabel(closeDate: string): string {
  return formatAssignmentDueDate(closeDate);
}

function initialsFromName(
  firstName: string | undefined,
  lastName: string | undefined,
  email: string | undefined,
): string {
  if (firstName || lastName) {
    const f = firstName?.trim()[0] ?? '';
    const l = lastName?.trim()[0] ?? '';
    return (f + l).toUpperCase() || '?';
  }
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  const tokens = local.split(/[._-]+/).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || '?';
}

function displayNameFromParts(
  firstName: string | undefined,
  lastName: string | undefined,
  email: string | undefined,
): string {
  const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
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
  const today = startOfDay(new Date());
  const closeDay = startOfDay(parseLocalAssignmentDate(params.assignment.close_date));

  if (params.allPairsSubmitted) {
    if (closeDay >= today) return 'completed';
    return null;
  }

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
        assignmentType: a.assignment_type,
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
      assignmentType: a.assignment_type,
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
  completed: 'Completed',
};

const statusPillClass: Record<DeadlineDisplayStatus, string> = {
  due_soon: 'student-home__pill--due-soon',
  not_started: 'student-home__pill--not-started',
  in_progress: 'student-home__pill--in-progress',
  completed: 'student-home__pill--submitted',
};

/** The caller's teams in a class: all of my projects intersected with the class's projects. */
async function fetchMyClassProjects(classId: string): Promise<{ id: string; name: string }[]> {
  const [{ projects: mine }, { projects: inClass }] = await Promise.all([
    api.getProjects(),
    api.getProjects(classId),
  ]);
  const myIds = new Set(mine.map((p) => p.id));
  return inClass.filter((p) => myIds.has(p.id)).map((p) => ({ id: p.id, name: p.name }));
}

/** Join requests to my projects plus team invites to me; empty if a read fails. */
async function fetchIncomingRequestRows(classId: string): Promise<IncomingRequestRow[]> {
  try {
    const [{ requests }, invitesRes] = await Promise.all([
      api.getIncomingJoinRequests(classId),
      api.getPendingTeamInvites(classId),
    ]);
    return incomingRowsFromApi(requests, invitesRes.requests ?? []);
  } catch {
    return [];
  }
}

/** My own join requests; empty if the read fails. */
async function fetchOutgoingRequestRows(classId: string): Promise<OutgoingRequestRow[]> {
  try {
    const { requests } = await api.getMyJoinRequests(classId);
    return outgoingRowsFromApi(requests ?? []);
  } catch {
    return [];
  }
}

interface ClassTeams {
  classId: string;
  projects: { id: string; name: string }[];
}

const NO_DEADLINES: DeadlineRow[] = [];
const NO_TEAM_PROJECTS: ClassTeams['projects'] = [];
const NO_TEAM_MEMBERS: TeamMemberRow[] = [];

const StudentHomeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openJoinClassModal } = useOutletContext<AppOutletContext>();
  const { selectedClass } = useClass();
  const { user } = useUser();

  const classId = selectedClass?.id;
  const courseLabel = selectedClass ? courseLabelFromClass(selectedClass) : '';

  // The caller's teams, tagged with the class they were loaded for so the
  // deadlines never pair one class's teams with another class.
  const [myClassProjects, setMyClassProjects] = useState<ClassTeams | null>(null);
  const [selectedTeamProjectId, setSelectedTeamProjectId] = useState<string | null>(null);
  // Loaded results, tagged with the inputs they were loaded for: a load is in
  // flight while its tag doesn't match the current inputs.
  const [loadedDeadlines, setLoadedDeadlines] = useState<{
    teams: ClassTeams;
    courseLabel: string;
    rows: DeadlineRow[];
  } | null>(null);
  const [loadedMembers, setLoadedMembers] = useState<{
    projectId: string;
    rows: TeamMemberRow[];
  } | null>(null);

  const [incomingRequests, setIncomingRequests] = useState<IncomingRequestRow[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [incomingProcessing, setIncomingProcessing] = useState<{
    requestId: string;
    action: 'accept' | 'reject';
  } | null>(null);
  const [incomingRequestError, setIncomingRequestError] = useState<string | null>(null);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequestRow[]>([]);
  const [outgoingLoading, setOutgoingLoading] = useState(false);
  const [dismissingRequestId, setDismissingRequestId] = useState<string | null>(null);
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);

  // A notification can send the user here asking for the requests modal. It
  // opens while rendering; the effect below then clears the flag from history.
  const openRequestsFromNav = Boolean(
    (location.state as { openRequests?: boolean } | null)?.openRequests,
  );
  const [prevOpenRequestsFromNav, setPrevOpenRequestsFromNav] = useState(false);
  if (prevOpenRequestsFromNav !== openRequestsFromNav) {
    setPrevOpenRequestsFromNav(openRequestsFromNav);
    if (openRequestsFromNav) setRequestsModalOpen(true);
  }

  useEffect(() => {
    if (openRequestsFromNav) navigate(location.pathname, { replace: true, state: {} });
  }, [openRequestsFromNav, navigate, location.pathname]);

  // A class switch reloads both request lists (see the effect below) and
  // clears the last accept/deny error; with no class the lists are empty.
  const [requestsClassId, setRequestsClassId] = useState<string | undefined>(undefined);
  if (requestsClassId !== classId) {
    setRequestsClassId(classId);
    setIncomingRequestError(null);
    setIncomingLoading(classId !== undefined);
    setOutgoingLoading(classId !== undefined);
    if (classId === undefined) {
      setIncomingRequests([]);
      setOutgoingRequests([]);
    }
  }

  const teamsForClass =
    classId !== undefined && myClassProjects?.classId === classId ? myClassProjects : null;
  const teamProjectsInClass = teamsForClass?.projects ?? NO_TEAM_PROJECTS;
  // Members show only for one of the selected class's teams.
  const teamProjectId =
    selectedTeamProjectId !== null &&
    teamProjectsInClass.some((p) => p.id === selectedTeamProjectId)
      ? selectedTeamProjectId
      : null;
  const teamMembers =
    teamProjectId !== null && loadedMembers?.projectId === teamProjectId
      ? loadedMembers.rows
      : NO_TEAM_MEMBERS;
  const teamLoading =
    (classId !== undefined && teamsForClass === null) ||
    (teamProjectId !== null && loadedMembers?.projectId !== teamProjectId);

  const deadlinesCurrent =
    loadedDeadlines !== null &&
    loadedDeadlines.teams === teamsForClass &&
    loadedDeadlines.courseLabel === courseLabel;
  const deadlineRows = deadlinesCurrent ? loadedDeadlines.rows : NO_DEADLINES;
  const deadlinesLoading = classId !== undefined && !deadlinesCurrent;

  const displayDeadlines = useMemo(
    () => deadlineRows.map((d) => ({ ...d, isMock: false as const })),
    [deadlineRows],
  );

  const showEmptyDeadlines = !deadlinesLoading && deadlineRows.length === 0;

  const refreshIncomingRequests = useCallback(async () => {
    if (!classId) {
      setIncomingRequests([]);
      setIncomingLoading(false);
      return;
    }
    setIncomingLoading(true);
    setIncomingRequests(await fetchIncomingRequestRows(classId));
    setIncomingLoading(false);
  }, [classId]);

  const refreshOutgoingRequests = useCallback(async () => {
    if (!classId) {
      setOutgoingRequests([]);
      setOutgoingLoading(false);
      return;
    }
    setOutgoingLoading(true);
    setOutgoingRequests(await fetchOutgoingRequestRows(classId));
    setOutgoingLoading(false);
  }, [classId]);

  const refreshAllRequests = useCallback(async () => {
    await Promise.all([refreshIncomingRequests(), refreshOutgoingRequests()]);
  }, [refreshIncomingRequests, refreshOutgoingRequests]);

  // Deadlines pair assignments with this class's teams, so they wait for those.
  useEffect(() => {
    if (!classId || !teamsForClass) return;
    const teams = teamsForClass;

    let cancelled = false;

    const load = async () => {
      try {
        const [{ assignments }, mySubmissions] = await Promise.all([
          api.getAssignments(classId),
          api.getMySubmissions(classId).catch(emptyMySubmissions),
        ]);

        // Only the caller's own submissions count: a scrum master's project TSR
        // list also contains teammates' rows, which marked deadlines done early.
        const tsrsByProject: Record<string, string[]> = {};
        for (const p of teams.projects) tsrsByProject[p.id] = [];
        for (const t of mySubmissions.tsrs) {
          if (t.project_id && tsrsByProject[t.project_id]) tsrsByProject[t.project_id].push(t.assignment_id);
        }

        if (cancelled) return;

        const rows = buildDeadlineRows(assignments, teams.projects, tsrsByProject, courseLabel);
        setLoadedDeadlines({ teams, courseLabel, rows });
      } catch {
        if (!cancelled) setLoadedDeadlines({ teams, courseLabel, rows: [] });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [classId, courseLabel, teamsForClass]);

  useEffect(() => {
    if (!classId) return;

    let cancelled = false;

    void fetchIncomingRequestRows(classId).then((rows) => {
      if (cancelled) return;
      setIncomingRequests(rows);
      setIncomingLoading(false);
    });
    void fetchOutgoingRequestRows(classId).then((rows) => {
      if (cancelled) return;
      setOutgoingRequests(rows);
      setOutgoingLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  useEffect(() => {
    if (!classId) return;

    let cancelled = false;

    const loadTeamProjects = async () => {
      try {
        const projects = await fetchMyClassProjects(classId);
        if (cancelled) return;
        setMyClassProjects({ classId, projects });
        setSelectedTeamProjectId((prev) => {
          if (prev && projects.some((p) => p.id === prev)) return prev;
          return projects[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          // Deadlines still load (without team rows) if the teams read fails.
          setMyClassProjects({ classId, projects: [] });
          setSelectedTeamProjectId(null);
        }
      }
    };

    loadTeamProjects();
    return () => {
      cancelled = true;
    };
  }, [classId]);

  useEffect(() => {
    if (!teamProjectId) return;

    let cancelled = false;

    const loadMembers = async () => {
      try {
        const { members } = await api.getProjectMembers(teamProjectId);
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
          initials: initialsFromName(m.first_name, m.last_name, m.email),
          displayName: displayNameFromParts(m.first_name, m.last_name, m.email),
          roleLabel: m.project_role || 'Member',
          presence: presenceCycle[i % presenceCycle.length],
          avatarClassIndex: i % 5,
          avatarUrl: m.image_url,
        }));

        setLoadedMembers({ projectId: teamProjectId, rows });
      } catch {
        if (!cancelled) setLoadedMembers({ projectId: teamProjectId, rows: [] });
      }
    };

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [teamProjectId]);

  const handleDeadlineNavigate = useCallback(
    (row: (typeof displayDeadlines)[number]) => {
      if ('isMock' in row && row.isMock) return;
      const r = row as DeadlineRow & { isMock?: boolean };
      navigate(`/app/assignments/${r.id}`, {
        state: {
          assignmentName: r.name,
          assignmentType: r.assignmentType === 'feedback'
            ? 'feedback'
            : r.assignmentType === 'interest_form'
            ? 'interest_form'
            : 'tsrs',
          dueDate: r.dueLabel,
          projectName: r.projectName ?? '—',
          projectId: r.projectId,
        },
      });
    },
    [navigate],
  );

  const handleAcceptIncoming = useCallback(
    async (row: IncomingRequestRow) => {
      setIncomingRequestError(null);
      setIncomingProcessing({ requestId: row.requestId, action: 'accept' });
      try {
        await api.acceptProjectJoinRequest(row.requestId);
        setIncomingRequests((prev) => prev.filter((r) => r.requestId !== row.requestId));
        if (selectedClass) {
          const classId = selectedClass.id;
          const projects = await fetchMyClassProjects(classId);
          setMyClassProjects({ classId, projects });
          setSelectedTeamProjectId((prev) => {
            if (prev && projects.some((p) => p.id === prev)) return prev;
            return projects[0]?.id ?? null;
          });
        }
      } catch {
        setIncomingRequestError('Could not accept this request. Please try again.');
        await refreshIncomingRequests();
      } finally {
        setIncomingProcessing(null);
      }
    },
    [refreshIncomingRequests, selectedClass],
  );

  const handleRejectIncoming = useCallback(
    async (row: IncomingRequestRow) => {
      setIncomingRequestError(null);
      setIncomingProcessing({ requestId: row.requestId, action: 'reject' });
      try {
        await api.rejectProjectJoinRequest(row.requestId);
        setIncomingRequests((prev) => prev.filter((r) => r.requestId !== row.requestId));
      } catch {
        setIncomingRequestError('Could not deny this request. Please try again.');
        await refreshIncomingRequests();
      } finally {
        setIncomingProcessing(null);
      }
    },
    [refreshIncomingRequests],
  );

  const handleDismissOutgoing = useCallback(
    async (row: OutgoingRequestRow) => {
      setDismissingRequestId(row.requestId);
      try {
        await api.dismissJoinRequest(row.requestId);
        setOutgoingRequests((prev) => prev.filter((r) => r.requestId !== row.requestId));
      } catch {
        await refreshOutgoingRequests();
      } finally {
        setDismissingRequestId(null);
      }
    },
    [refreshOutgoingRequests],
  );

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
              <div className="student-home__deadlines-scroll" aria-busy="true">
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
                    {Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>
                        <td><Skeleton width="70%" height={13} /></td>
                        <td><Skeleton width="60%" height={13} /></td>
                        <td><Skeleton width={64} height={20} radius={20} /></td>
                        <td className="student-home__chevron"><Skeleton width={16} height={16} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                          {!selectedClass ? 'Select a class to see your deadlines.' : 'No upcoming deadlines.'}
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
              <button
                type="button"
                className="student-home__link"
                onClick={() => setRequestsModalOpen(true)}
              >
                See All
              </button>
            </div>
            {incomingRequestError ? (
              <p className="student-home__request-feedback" role="alert">
                {incomingRequestError}
              </p>
            ) : null}
            <div className="student-home__requests-list">
              {(incomingLoading || outgoingLoading) && selectedClass ? (
                <div aria-busy="true">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="student-home__request-card">
                      <div className="student-home__request-top">
                        <Skeleton circle height={40} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Skeleton width="50%" height={13} />
                          <Skeleton width="70%" height={11} style={{ marginTop: 6 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {!incomingLoading &&
                incomingRequests.map((row) => {
                  const who = displayNameFromEmail(row.counterpartyEmail);
                  const requestedMeta = formatRequestedMeta(row.requestedAt);
                  const rowBusy = incomingProcessing?.requestId === row.requestId;
                  const accepting = rowBusy && incomingProcessing?.action === 'accept';
                  const denying = rowBusy && incomingProcessing?.action === 'reject';
                  return (
                    <div key={row.requestId} className="student-home__request-card">
                      <div className="student-home__request-top">
                        <div
                          className="student-home__avatar"
                          style={{ backgroundColor: avatarBgFromEmail(row.counterpartyEmail) }}
                        >
                          {initialsFromEmail(row.counterpartyEmail)}
                        </div>
                        <div className="student-home__request-main">
                          <h3 className="student-home__request-title">{row.projectName}</h3>
                          <p className="student-home__request-sub">
                            {row.kind === 'team_invite'
                              ? `${who} invited you to join this project`
                              : `${who} wants to join this project`}
                          </p>
                          {row.message ? (
                            <p className="student-home__request-message">
                              &ldquo;{row.message}&rdquo;
                            </p>
                          ) : null}
                          <div className="student-home__badges">
                            <span className="student-home__badge">
                              {row.memberCount} {row.memberCount === 1 ? 'Member' : 'Members'}
                            </span>
                            <span className="student-home__badge">Incoming</span>
                          </div>
                          {requestedMeta ? (
                            <div className="student-home__awaiting">
                              <Clock size={14} aria-hidden />
                              {requestedMeta}
                            </div>
                          ) : null}
                          <div className="student-home__request-actions">
                            <button
                              type="button"
                              className="student-home__btn-accept"
                              disabled={rowBusy}
                              aria-busy={accepting}
                              onClick={() => void handleAcceptIncoming(row)}
                            >
                              {accepting ? (
                                <>
                                  <Loader2
                                    className="student-home__btn-spinner"
                                    size={16}
                                    aria-hidden
                                  />
                                  Accepting…
                                </>
                              ) : (
                                'Accept'
                              )}
                            </button>
                            <button
                              type="button"
                              className="student-home__btn-deny"
                              disabled={rowBusy}
                              aria-busy={denying}
                              onClick={() => void handleRejectIncoming(row)}
                            >
                              {denying ? (
                                <>
                                  <Loader2
                                    className="student-home__btn-spinner"
                                    size={16}
                                    aria-hidden
                                  />
                                  Denying…
                                </>
                              ) : (
                                'Deny'
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              {outgoingRequests.map((req) => {
                const denied = req.status === 'rejected';
                const awaitingMeta = formatAwaitingMeta(req.requestedAt);
                const dismissing = dismissingRequestId === req.requestId;
                return (
                  <div key={req.requestId} className="student-home__request-card">
                    <div className="student-home__request-top">
                      {req.imageUrl ? (
                        <img
                          src={req.imageUrl}
                          alt={req.projectName}
                          className="student-home__avatar student-home__avatar--thumbnail"
                        />
                      ) : (
                        <div
                          className="student-home__avatar"
                          style={{ backgroundColor: avatarBgFromEmail(req.projectName) }}
                        >
                          {req.projectName.trim()[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <div className="student-home__request-main">
                        <h3 className="student-home__request-title">{req.projectName}</h3>
                        <p className="student-home__request-sub">
                          {denied
                            ? 'Your request to join this project was denied'
                            : req.courseLabel ?? 'Pending project join request'}
                        </p>
                        <div className="student-home__badges">
                          <span className="student-home__badge">
                            {req.memberCount} {req.memberCount === 1 ? 'Member' : 'Members'}
                          </span>
                          {req.sponsorCompany ? (
                            <span className="student-home__badge">Company Sponsored</span>
                          ) : null}
                          {denied ? (
                            <span className="student-home__badge student-home__badge--denied">
                              Denied
                            </span>
                          ) : (
                            <span className="student-home__badge student-home__badge--purple">
                              Outgoing
                            </span>
                          )}
                        </div>
                        {denied ? (
                          <div className="student-home__request-actions">
                            <button
                              type="button"
                              className="student-home__btn-deny"
                              disabled={dismissing}
                              aria-busy={dismissing}
                              onClick={() => void handleDismissOutgoing(req)}
                            >
                              {dismissing ? (
                                <>
                                  <Loader2
                                    className="student-home__btn-spinner"
                                    size={16}
                                    aria-hidden
                                  />
                                  Dismissing…
                                </>
                              ) : (
                                <>
                                  <X size={16} aria-hidden />
                                  Dismiss
                                </>
                              )}
                            </button>
                          </div>
                        ) : awaitingMeta ? (
                          <div className="student-home__awaiting">
                            <Clock size={14} aria-hidden />
                            {awaitingMeta}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!incomingLoading &&
                !outgoingLoading &&
                incomingRequests.length === 0 &&
                outgoingRequests.length === 0 && (
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
            {/* TODO: wire real schedule data once calendar integration exists.
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
            */}
            <div className="student-home__schedule-empty">
              <div className="student-home__schedule-empty-icon" aria-hidden>
                <CalendarDays size={22} strokeWidth={1.5} />
              </div>
              <p className="student-home__schedule-empty-title">
                Class events and deadlines will appear here.
              </p>
            </div>
          </section>

          <section className="student-home__card" aria-labelledby="team-heading">
            <div className="student-home__card-header">
              <h2 id="team-heading" className="student-home__card-title">
                Your team
              </h2>
              {teamProjectsInClass.length === 1 && (
                <span className="student-home__team-project">{teamProjectsInClass[0].name}</span>
              )}
              {teamProjectsInClass.length >= 2 && teamProjectId ? (
                <select
                  id="team-project-select"
                  className="student-home__team-project-select"
                  aria-label="Select project to view team"
                  value={teamProjectId}
                  onChange={(e) => setSelectedTeamProjectId(e.target.value || null)}
                >
                  {teamProjectsInClass.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {teamLoading ? (
              <ul className="student-home__team-list" aria-busy="true">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="student-home__team-item">
                    <div className="student-home__team-avatar-wrap">
                      <Skeleton circle height={40} />
                    </div>
                    <div className="student-home__team-text">
                      <Skeleton width="60%" height={13} />
                      <Skeleton width="40%" height={11} style={{ marginTop: 6 }} />
                    </div>
                  </li>
                ))}
              </ul>
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
                        {m.avatarUrl ? (
                          <img
                            src={m.avatarUrl}
                            alt={m.displayName}
                            className="student-home__team-avatar student-home__team-avatar--photo"
                          />
                        ) : (
                          <div
                            className={`student-home__team-avatar student-home__team-avatar--${m.avatarClassIndex}`}
                          >
                            {m.initials}
                          </div>
                        )}
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

      <RequestsModal
        isOpen={requestsModalOpen}
        onClose={() => setRequestsModalOpen(false)}
        classId={selectedClass?.id}
        onRequestsChanged={() => void refreshAllRequests()}
      />
    </div>
  );
};

export default StudentHomeDashboard;

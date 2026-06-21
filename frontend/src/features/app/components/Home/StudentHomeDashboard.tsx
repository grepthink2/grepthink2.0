import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  FolderOpen,
  Loader2,
  MessageCircle,
} from 'lucide-react';
import {
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  parseISO,
  startOfDay,
} from 'date-fns';
import { useClass } from '@/lib/classContext';
import { useUser } from '@/lib/auth';
import { api, type ApiAssignment } from '@/lib/api';
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

/** Display string for assignment due date in the user’s local calendar. */
function formatDueLabel(closeDate: string): string {
  return format(parseLocalAssignmentDate(closeDate), 'MMM d, yyyy');
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

function initialsFromEmail(email: string | undefined): string {
  return initialsFromName(undefined, undefined, email);
}

function displayNameFromEmail(email: string | undefined): string {
  return displayNameFromParts(undefined, undefined, email);
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

const JOIN_REVIEW_ROLES = new Set(['owner', 'product owner', 'admin']);

function canReviewJoinRequests(role: string | null | undefined): boolean {
  if (role == null || role === '') return false;
  return JOIN_REVIEW_ROLES.has(role.trim().toLowerCase());
}

function avatarBgFromEmail(email: string | undefined): string {
  if (!email) return '#018156';
  let h = 0;
  for (let i = 0; i < email.length; i += 1) {
    h = (h + email.charCodeAt(i) * (i + 1)) % 360;
  }
  return `hsl(${h} 42% 40%)`;
}

interface OutgoingJoinRequestRow {
  requestId: string;
  projectId: string;
  projectName: string;
  courseLabel?: string;
  memberCount: number;
  sponsorCompany?: string;
  requestedAt?: string;
}

interface IncomingJoinRequestRow {
  requestId: string;
  projectId: string;
  projectName: string;
  requesterEmail?: string;
  requestedAt?: string;
  memberCount: number;
}

function formatAwaitingMeta(iso: string | undefined): string | null {
  if (!iso) return 'Awaiting Response';
  try {
    return `Awaiting Response • ${formatDistanceToNow(parseISO(iso), { addSuffix: true })}`;
  } catch {
    return 'Awaiting Response';
  }
}

function formatRequestedMeta(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return `Requested ${formatDistanceToNow(parseISO(iso), { addSuffix: true })}`;
  } catch {
    return null;
  }
}

const StudentHomeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openJoinClassModal } = useOutletContext<AppOutletContext>();
  const { selectedClass } = useClass();
  const { user } = useUser();

  const [deadlineRows, setDeadlineRows] = useState<DeadlineRow[]>([]);
  const [deadlinesLoading, setDeadlinesLoading] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMemberRow[]>([]);
  const [teamProjectsInClass, setTeamProjectsInClass] = useState<{ id: string; name: string }[]>([]);
  const [selectedTeamProjectId, setSelectedTeamProjectId] = useState<string | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);

  const [incomingRequests, setIncomingRequests] = useState<IncomingJoinRequestRow[]>([]);
  const [incomingLoading, setIncomingLoading] = useState(false);
  const [incomingProcessing, setIncomingProcessing] = useState<{
    requestId: string;
    action: 'accept' | 'reject';
  } | null>(null);
  const [incomingRequestError, setIncomingRequestError] = useState<string | null>(null);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingJoinRequestRow[]>([]);
  const [outgoingLoading, setOutgoingLoading] = useState(false);
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);

  useEffect(() => {
    const state = location.state as { openRequests?: boolean } | null;
    if (state?.openRequests) {
      setRequestsModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const displayDeadlines = deadlineRows.map((d) => ({ ...d, isMock: false as const }));

  const showEmptyDeadlines = !deadlinesLoading && deadlineRows.length === 0;

  const refreshIncomingRequests = useCallback(async () => {
    const classId = selectedClass?.id;
    if (!classId) {
      setIncomingRequests([]);
      setIncomingLoading(false);
      return;
    }
    setIncomingLoading(true);
    try {
      const { projects: myAllProjects } = await api.getProjects();
      const { projects: classProjects } = await api.getProjects(classId);
      const myIds = new Set(myAllProjects.map((p) => p.id));
      const mineInClass = classProjects.filter((p) => myIds.has(p.id));
      const reviewable = mineInClass.filter((p) => canReviewJoinRequests(p.user_role));

      const chunks = await Promise.all(
        reviewable.map(async (proj) => {
          try {
            const { requests } = await api.getProjectJoinRequests(proj.id);
            return requests.map(
              (r): IncomingJoinRequestRow => ({
                requestId: r.request_id,
                projectId: proj.id,
                projectName: proj.name,
                requesterEmail: r.email,
                requestedAt: r.requested_at,
                memberCount: proj.member_count ?? 0,
              }),
            );
          } catch {
            return [];
          }
        }),
      );
      const collected = chunks.flat();
      collected.sort((a, b) => {
        const ta = a.requestedAt ? parseISO(a.requestedAt).getTime() : 0;
        const tb = b.requestedAt ? parseISO(b.requestedAt).getTime() : 0;
        return ta - tb;
      });
      setIncomingRequests(collected);
    } catch {
      setIncomingRequests([]);
    } finally {
      setIncomingLoading(false);
    }
  }, [selectedClass?.id]);

  const refreshOutgoingRequests = useCallback(async () => {
    const classId = selectedClass?.id;
    if (!classId) {
      setOutgoingRequests([]);
      setOutgoingLoading(false);
      return;
    }
    setOutgoingLoading(true);
    try {
      const { requests } = await api.getMyJoinRequests(classId);
      setOutgoingRequests(
        (requests ?? []).map(
          (r): OutgoingJoinRequestRow => ({
            requestId: r.request_id,
            projectId: r.project_id ?? '',
            projectName: r.project_name ?? 'Project',
            courseLabel: r.course_label,
            memberCount: r.member_count ?? 0,
            sponsorCompany: r.sponsor_company,
            requestedAt: r.requested_at,
          }),
        ),
      );
    } catch {
      setOutgoingRequests([]);
    } finally {
      setOutgoingLoading(false);
    }
  }, [selectedClass?.id]);

  const refreshAllRequests = useCallback(async () => {
    await Promise.all([refreshIncomingRequests(), refreshOutgoingRequests()]);
  }, [refreshIncomingRequests, refreshOutgoingRequests]);

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
    void refreshIncomingRequests();
    void refreshOutgoingRequests();
  }, [refreshIncomingRequests, refreshOutgoingRequests]);

  useEffect(() => {
    setIncomingRequestError(null);
  }, [selectedClass?.id]);

  useEffect(() => {
    if (!selectedClass) {
      setTeamProjectsInClass([]);
      setSelectedTeamProjectId(null);
      setTeamMembers([]);
      return;
    }

    let cancelled = false;

    const loadTeamProjects = async () => {
      setTeamLoading(true);
      try {
        const { projects: myAllProjects } = await api.getProjects();
        const { projects: classProjects } = await api.getProjects(selectedClass.id);
        const myIds = new Set(myAllProjects.map((p) => p.id));
        const mineInClass = classProjects
          .filter((p) => myIds.has(p.id))
          .map((p) => ({ id: p.id, name: p.name }));

        if (cancelled) return;

        setTeamProjectsInClass(mineInClass);
        setSelectedTeamProjectId((prev) => {
          if (prev && mineInClass.some((p) => p.id === prev)) return prev;
          return mineInClass[0]?.id ?? null;
        });
      } catch {
        if (!cancelled) {
          setTeamProjectsInClass([]);
          setSelectedTeamProjectId(null);
        }
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    };

    loadTeamProjects();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.id]);

  useEffect(() => {
    if (!selectedClass || !selectedTeamProjectId) {
      setTeamMembers([]);
      return;
    }

    let cancelled = false;

    const loadMembers = async () => {
      setTeamLoading(true);
      try {
        const { members } = await api.getProjectMembers(selectedTeamProjectId);
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

        setTeamMembers(rows);
      } catch {
        if (!cancelled) setTeamMembers([]);
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    };

    loadMembers();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.id, selectedTeamProjectId]);

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
    async (row: IncomingJoinRequestRow) => {
      setIncomingRequestError(null);
      setIncomingProcessing({ requestId: row.requestId, action: 'accept' });
      try {
        await api.acceptProjectJoinRequest(row.requestId);
        setIncomingRequests((prev) => prev.filter((r) => r.requestId !== row.requestId));
        if (selectedClass) {
          const { projects: myAllProjects } = await api.getProjects();
          const { projects: classProjects } = await api.getProjects(selectedClass.id);
          const myIds = new Set(myAllProjects.map((p) => p.id));
          const mineInClass = classProjects
            .filter((p) => myIds.has(p.id))
            .map((p) => ({ id: p.id, name: p.name }));
          setTeamProjectsInClass(mineInClass);
          setSelectedTeamProjectId((prev) => {
            if (prev && mineInClass.some((p) => p.id === prev)) return prev;
            return mineInClass[0]?.id ?? null;
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
    async (row: IncomingJoinRequestRow) => {
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
                  const who = displayNameFromEmail(row.requesterEmail);
                  const requestedMeta = formatRequestedMeta(row.requestedAt);
                  const rowBusy = incomingProcessing?.requestId === row.requestId;
                  const accepting = rowBusy && incomingProcessing?.action === 'accept';
                  const denying = rowBusy && incomingProcessing?.action === 'reject';
                  return (
                    <div key={row.requestId} className="student-home__request-card">
                      <div className="student-home__request-top">
                        <div
                          className="student-home__avatar"
                          style={{ backgroundColor: avatarBgFromEmail(row.requesterEmail) }}
                        >
                          {initialsFromEmail(row.requesterEmail)}
                        </div>
                        <div className="student-home__request-main">
                          <h3 className="student-home__request-title">{row.projectName}</h3>
                          <p className="student-home__request-sub">
                            {`${who} wants to join this project`}
                          </p>
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
                const awaitingMeta = formatAwaitingMeta(req.requestedAt);
                return (
                  <div key={req.requestId} className="student-home__request-card">
                    <div className="student-home__request-top">
                      <div
                        className="student-home__avatar"
                        style={{ backgroundColor: avatarBgFromEmail(req.projectName) }}
                      >
                        {req.projectName.trim()[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div className="student-home__request-main">
                        <h3 className="student-home__request-title">{req.projectName}</h3>
                        <p className="student-home__request-sub">
                          {req.courseLabel ?? 'Pending project join request'}
                        </p>
                        <div className="student-home__badges">
                          <span className="student-home__badge">
                            {req.memberCount} {req.memberCount === 1 ? 'Member' : 'Members'}
                          </span>
                          {req.sponsorCompany ? (
                            <span className="student-home__badge">Company Sponsored</span>
                          ) : null}
                          <span className="student-home__badge student-home__badge--purple">
                            Outgoing
                          </span>
                        </div>
                        {awaitingMeta ? (
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
              {teamProjectsInClass.length >= 2 && selectedTeamProjectId ? (
                <select
                  id="team-project-select"
                  className="student-home__team-project-select"
                  aria-label="Select project to view team"
                  value={selectedTeamProjectId}
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

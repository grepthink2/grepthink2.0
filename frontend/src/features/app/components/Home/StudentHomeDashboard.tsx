import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { CalendarDays, Clock, Loader2, X } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { useUser } from '@/lib/auth';
import { api } from '@/lib/api';
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
} from './mockData';
import RequestsModal from './RequestsModal';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './StudentHomeDashboard.scss';

interface TeamMemberRow {
  userId: string;
  initials: string;
  displayName: string;
  roleLabel: string;
  presence: 'green' | 'orange' | 'gray' | 'none';
  avatarClassIndex: number;
  avatarUrl?: string;
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

const NO_TEAM_PROJECTS: ClassTeams['projects'] = [];
const NO_TEAM_MEMBERS: TeamMemberRow[] = [];

const StudentHomeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { openJoinClassModal } = useOutletContext<AppOutletContext>();
  // `classes` is every class the account is in: none at all is when Home offers to join one.
  const { selectedClass, classes } = useClass();
  const { user } = useUser();

  const classId = selectedClass?.id;

  // The caller's teams, tagged with the class they were loaded for so the
  // team card never shows one class's teams under another class.
  const [myClassProjects, setMyClassProjects] = useState<ClassTeams | null>(null);
  const [selectedTeamProjectId, setSelectedTeamProjectId] = useState<string | null>(null);
  // Loaded members, tagged with the project they were loaded for: a load is in
  // flight while the tag doesn't match the selected project.
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
          // A failed teams read shows no team instead of loading forever.
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
      {classes.length === 0 && (
        <Alert
          className="student-home__join-banner"
          actions={
            <Button size="sm" onClick={() => openJoinClassModal()}>
              Join Class
            </Button>
          }
        >
          Looks like you&apos;re not in any class yet. Join one with the class code your instructor
          gave you.
        </Alert>
      )}
      <div className="student-home__grid">
        <div className="student-home__column student-home__column--main">
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
        </div>

        <div className="student-home__column student-home__column--aside">
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

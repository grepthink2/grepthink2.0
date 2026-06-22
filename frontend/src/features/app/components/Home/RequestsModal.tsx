import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, X } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { api } from '@/lib/api';
import './RequestsModal.scss';

type TabId = 'incoming' | 'outgoing';
type IncomingKind = 'join_request' | 'team_invite';

export interface IncomingRequestRow {
  requestId: string;
  projectId: string;
  projectName: string;
  kind: IncomingKind;
  counterpartyEmail?: string;
  requestedAt?: string;
  memberCount: number;
  message?: string | null;
}

export interface OutgoingRequestRow {
  requestId: string;
  projectId: string;
  projectName: string;
  courseLabel?: string;
  memberCount: number;
  sponsorCompany?: string;
  requestedAt?: string;
  status?: string;
}

export interface RequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string | undefined;
  onRequestsChanged?: () => void;
}

const JOIN_REVIEW_ROLES = new Set(['owner', 'product owner', 'admin']);

function canReviewJoinRequests(role: string | null | undefined): boolean {
  if (role == null || role === '') return false;
  return JOIN_REVIEW_ROLES.has(role.trim().toLowerCase());
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

function avatarBgFromEmail(email: string | undefined): string {
  if (!email) return '#018156';
  let h = 0;
  for (let i = 0; i < email.length; i += 1) {
    h = (h + email.charCodeAt(i) * (i + 1)) % 360;
  }
  return `hsl(${h} 42% 40%)`;
}

function formatRequestedMeta(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    return `Requested ${formatDistanceToNow(parseISO(iso), { addSuffix: true })}`;
  } catch {
    return null;
  }
}

function formatAwaitingMeta(iso: string | undefined): string | null {
  if (!iso) return 'Awaiting Response';
  try {
    return `Awaiting Response • ${formatDistanceToNow(parseISO(iso), { addSuffix: true })}`;
  } catch {
    return 'Awaiting Response';
  }
}

const RequestsModal: React.FC<RequestsModalProps> = ({
  isOpen,
  onClose,
  classId,
  onRequestsChanged,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('incoming');
  const [incoming, setIncoming] = useState<IncomingRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingRequestRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<{
    requestId: string;
    action: 'accept' | 'reject';
  } | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!classId) {
      setIncoming([]);
      setOutgoing([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [{ projects: myAllProjects }, { projects: classProjects }, invitesRes, outgoingRes] =
        await Promise.all([
          api.getProjects(),
          api.getProjects(classId),
          api.getPendingTeamInvites(classId),
          api.getMyJoinRequests(classId),
        ]);

      const myIds = new Set(myAllProjects.map((p) => p.id));
      const mineInClass = classProjects.filter((p) => myIds.has(p.id));
      const reviewable = mineInClass.filter((p) => canReviewJoinRequests(p.user_role));

      const joinChunks = await Promise.all(
        reviewable.map(async (proj) => {
          try {
            const { requests } = await api.getProjectJoinRequests(proj.id);
            return requests.map(
              (r): IncomingRequestRow => ({
                requestId: r.request_id,
                projectId: proj.id,
                projectName: proj.name,
                kind: 'join_request',
                counterpartyEmail: r.email,
                requestedAt: r.requested_at,
                memberCount: proj.member_count ?? 0,
                message: r.message,
              }),
            );
          } catch {
            return [];
          }
        }),
      );

      const teamInvites: IncomingRequestRow[] = (invitesRes.requests ?? []).map((r) => ({
        requestId: r.request_id,
        projectId: r.project_id ?? '',
        projectName: r.project_name ?? 'Project',
        kind: 'team_invite',
        counterpartyEmail: r.email,
        requestedAt: r.requested_at,
        memberCount: r.member_count ?? 0,
      }));

      const incomingRows = [...joinChunks.flat(), ...teamInvites];
      incomingRows.sort((a, b) => {
        const ta = a.requestedAt ? parseISO(a.requestedAt).getTime() : 0;
        const tb = b.requestedAt ? parseISO(b.requestedAt).getTime() : 0;
        return ta - tb;
      });

      const outgoingRows: OutgoingRequestRow[] = (outgoingRes.requests ?? []).map((r) => ({
        requestId: r.request_id,
        projectId: r.project_id ?? '',
        projectName: r.project_name ?? 'Project',
        courseLabel: r.course_label,
        memberCount: r.member_count ?? 0,
        sponsorCompany: r.sponsor_company,
        requestedAt: r.requested_at,
        status: r.status,
      }));

      setIncoming(incomingRows);
      setOutgoing(outgoingRows);
    } catch {
      setError('Could not load requests. Please try again.');
      setIncoming([]);
      setOutgoing([]);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('incoming');
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !processing) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, processing]);

  const handleAccept = useCallback(
    async (row: IncomingRequestRow) => {
      setError(null);
      setProcessing({ requestId: row.requestId, action: 'accept' });
      try {
        await api.acceptProjectJoinRequest(row.requestId);
        setIncoming((prev) => prev.filter((r) => r.requestId !== row.requestId));
        onRequestsChanged?.();
      } catch {
        setError('Could not accept this request. Please try again.');
        await refresh();
      } finally {
        setProcessing(null);
      }
    },
    [onRequestsChanged, refresh],
  );

  const handleReject = useCallback(
    async (row: IncomingRequestRow) => {
      setError(null);
      setProcessing({ requestId: row.requestId, action: 'reject' });
      try {
        await api.rejectProjectJoinRequest(row.requestId);
        setIncoming((prev) => prev.filter((r) => r.requestId !== row.requestId));
        onRequestsChanged?.();
      } catch {
        setError('Could not decline this request. Please try again.');
        await refresh();
      } finally {
        setProcessing(null);
      }
    },
    [onRequestsChanged, refresh],
  );

  const handleDismiss = useCallback(
    async (row: OutgoingRequestRow) => {
      setError(null);
      setDismissingId(row.requestId);
      try {
        await api.dismissJoinRequest(row.requestId);
        setOutgoing((prev) => prev.filter((r) => r.requestId !== row.requestId));
        onRequestsChanged?.();
      } catch {
        setError('Could not dismiss this request. Please try again.');
        await refresh();
      } finally {
        setDismissingId(null);
      }
    },
    [onRequestsChanged, refresh],
  );

  const handleBackdropClick = () => {
    if (!processing) onClose();
  };

  if (!isOpen) return null;

  const incomingCount = incoming.length;
  const outgoingCount = outgoing.length;
  const activeItems = activeTab === 'incoming' ? incoming : outgoing;
  const showEmpty = !loading && activeItems.length === 0;

  return (
    <div className="requests-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="requests-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="requests-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="requests-modal__close"
          onClick={onClose}
          disabled={Boolean(processing)}
          aria-label="Close requests"
        >
          <X size={22} />
        </button>

        <header className="requests-modal__header">
          <h2 id="requests-modal-title" className="requests-modal__title">
            Requests
          </h2>
          <p className="requests-modal__subtitle">
            Review join requests for your projects and track requests you&apos;ve sent.
          </p>
        </header>

        <div className="requests-modal__tabs" role="tablist" aria-label="Request direction">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'incoming'}
            className={`requests-modal__tab${activeTab === 'incoming' ? ' requests-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('incoming')}
          >
            Incoming
            {incomingCount > 0 ? (
              <span className="requests-modal__tab-count">{incomingCount}</span>
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'outgoing'}
            className={`requests-modal__tab${activeTab === 'outgoing' ? ' requests-modal__tab--active' : ''}`}
            onClick={() => setActiveTab('outgoing')}
          >
            Outgoing
            {outgoingCount > 0 ? (
              <span className="requests-modal__tab-count">{outgoingCount}</span>
            ) : null}
          </button>
        </div>

        {error ? (
          <p className="requests-modal__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="requests-modal__body">
          {!classId ? (
            <p className="requests-modal__empty">Select a class to view your requests.</p>
          ) : loading ? (
            <p className="requests-modal__loading">
              <Loader2 className="requests-modal__spinner" size={18} aria-hidden />
              Loading requests…
            </p>
          ) : showEmpty ? (
            <p className="requests-modal__empty">
              {activeTab === 'incoming'
                ? 'No incoming requests right now.'
                : 'No outgoing requests right now.'}
            </p>
          ) : activeTab === 'incoming' ? (
            <ul className="requests-modal__list">
              {incoming.map((row) => {
                const who = displayNameFromEmail(row.counterpartyEmail);
                const requestedMeta = formatRequestedMeta(row.requestedAt);
                const rowBusy = processing?.requestId === row.requestId;
                const accepting = rowBusy && processing?.action === 'accept';
                const declining = rowBusy && processing?.action === 'reject';
                const subtext =
                  row.kind === 'team_invite'
                    ? `${who} invited you to join this project`
                    : `${who} wants to join this project`;

                return (
                  <li key={row.requestId} className="requests-modal__card">
                    <div
                      className="requests-modal__avatar"
                      style={{ backgroundColor: avatarBgFromEmail(row.counterpartyEmail) }}
                    >
                      {initialsFromEmail(row.counterpartyEmail)}
                    </div>
                    <div className="requests-modal__card-main">
                      <h3 className="requests-modal__card-title">{row.projectName}</h3>
                      <p className="requests-modal__card-sub">{subtext}</p>
                      {row.kind === 'join_request' && row.message ? (
                        <p className="requests-modal__card-message">&ldquo;{row.message}&rdquo;</p>
                      ) : null}
                      <div className="requests-modal__badges">
                        <span className="requests-modal__badge">
                          {row.memberCount} {row.memberCount === 1 ? 'Member' : 'Members'}
                        </span>
                        <span className="requests-modal__badge">Incoming</span>
                        {row.kind === 'team_invite' ? (
                          <span className="requests-modal__badge requests-modal__badge--purple">
                            Invitation
                          </span>
                        ) : null}
                      </div>
                      {requestedMeta ? (
                        <div className="requests-modal__meta">
                          <Clock size={14} aria-hidden />
                          {requestedMeta}
                        </div>
                      ) : null}
                      <div className="requests-modal__actions">
                        <button
                          type="button"
                          className="requests-modal__btn requests-modal__btn--accept"
                          disabled={rowBusy}
                          aria-busy={accepting}
                          onClick={() => void handleAccept(row)}
                        >
                          {accepting ? (
                            <>
                              <Loader2 className="requests-modal__btn-spinner" size={16} aria-hidden />
                              Accepting…
                            </>
                          ) : (
                            'Accept'
                          )}
                        </button>
                        <button
                          type="button"
                          className="requests-modal__btn requests-modal__btn--decline"
                          disabled={rowBusy}
                          aria-busy={declining}
                          onClick={() => void handleReject(row)}
                        >
                          {declining ? (
                            <>
                              <Loader2 className="requests-modal__btn-spinner" size={16} aria-hidden />
                              Declining…
                            </>
                          ) : (
                            'Decline'
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="requests-modal__list">
              {outgoing.map((row) => {
                const denied = row.status === 'rejected';
                const awaitingMeta = formatAwaitingMeta(row.requestedAt);
                const dismissing = dismissingId === row.requestId;
                return (
                  <li key={row.requestId} className="requests-modal__card">
                    <div
                      className="requests-modal__avatar"
                      style={{ backgroundColor: avatarBgFromEmail(row.projectName) }}
                    >
                      {row.projectName.trim()[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="requests-modal__card-main">
                      <h3 className="requests-modal__card-title">{row.projectName}</h3>
                      {denied ? (
                        <p className="requests-modal__card-sub">
                          Your request to join this project was denied
                        </p>
                      ) : row.courseLabel ? (
                        <p className="requests-modal__card-sub">{row.courseLabel}</p>
                      ) : null}
                      <div className="requests-modal__badges">
                        <span className="requests-modal__badge">
                          {row.memberCount} {row.memberCount === 1 ? 'Member' : 'Members'}
                        </span>
                        {row.sponsorCompany ? (
                          <span className="requests-modal__badge">Company Sponsored</span>
                        ) : null}
                        {denied ? (
                          <span className="requests-modal__badge requests-modal__badge--denied">
                            Denied
                          </span>
                        ) : (
                          <span className="requests-modal__badge requests-modal__badge--purple">
                            Outgoing
                          </span>
                        )}
                      </div>
                      {denied ? (
                        <div className="requests-modal__actions">
                          <button
                            type="button"
                            className="requests-modal__btn requests-modal__btn--decline"
                            disabled={dismissing}
                            aria-busy={dismissing}
                            onClick={() => void handleDismiss(row)}
                          >
                            {dismissing ? (
                              <>
                                <Loader2 className="requests-modal__btn-spinner" size={16} aria-hidden />
                                Dismissing…
                              </>
                            ) : (
                              'Dismiss'
                            )}
                          </button>
                        </div>
                      ) : awaitingMeta ? (
                        <div className="requests-modal__meta">
                          <Clock size={14} aria-hidden />
                          {awaitingMeta}
                        </div>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestsModal;

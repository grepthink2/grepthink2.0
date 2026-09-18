import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, X } from 'lucide-react';
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
import './RequestsModal.scss';

type TabId = 'incoming' | 'outgoing';

interface RequestRows {
  incoming: IncomingRequestRow[];
  outgoing: OutgoingRequestRow[];
}

/** Both request directions (incoming includes team invites), or null if a read fails. */
async function fetchRequestRows(classId: string): Promise<RequestRows | null> {
  try {
    const [{ requests: joinRequests }, invitesRes, outgoingRes] = await Promise.all([
      api.getIncomingJoinRequests(classId),
      api.getPendingTeamInvites(classId),
      api.getMyJoinRequests(classId),
    ]);
    return {
      incoming: incomingRowsFromApi(joinRequests, invitesRes.requests ?? []),
      outgoing: outgoingRowsFromApi(outgoingRes.requests ?? []),
    };
  } catch {
    return null;
  }
}

export interface RequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string | undefined;
  onRequestsChanged?: () => void;
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
  // The last accept, decline or dismiss that failed. It is kept apart from
  // `error`, which `refresh` resets, so it survives the reload after the failure.
  const [actionError, setActionError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<{
    requestId: string;
    action: 'accept' | 'reject';
  } | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  // Opening the modal, or switching class while it is open, starts over on the
  // Incoming tab with a fresh load. That reset happens while rendering; the
  // effect below only fetches.
  const [prevProps, setPrevProps] = useState({ isOpen: false, classId });
  if (prevProps.isOpen !== isOpen || prevProps.classId !== classId) {
    setPrevProps({ isOpen, classId });
    if (isOpen) {
      setActiveTab('incoming');
      setActionError(null);
      if (classId) {
        setLoading(true);
        setError(null);
      } else {
        setIncoming([]);
        setOutgoing([]);
        setLoading(false);
      }
    }
  }

  // Shows a finished load: its rows, or the load error with empty lists.
  const showLoaded = useCallback((rows: RequestRows | null) => {
    if (rows) {
      setIncoming(rows.incoming);
      setOutgoing(rows.outgoing);
    } else {
      setError('Could not load requests. Please try again.');
      setIncoming([]);
      setOutgoing([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isOpen || !classId) return;
    let cancelled = false;
    void fetchRequestRows(classId).then((rows) => {
      if (!cancelled) showLoaded(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, classId, showLoaded]);

  // Reloads after an action fails.
  const refresh = useCallback(async () => {
    if (!classId) {
      setIncoming([]);
      setOutgoing([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    showLoaded(await fetchRequestRows(classId));
  }, [classId, showLoaded]);

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
      setActionError(null);
      setProcessing({ requestId: row.requestId, action: 'accept' });
      try {
        await api.acceptProjectJoinRequest(row.requestId);
        setIncoming((prev) => prev.filter((r) => r.requestId !== row.requestId));
        onRequestsChanged?.();
      } catch {
        setActionError('Could not accept this request. Please try again.');
        await refresh();
      } finally {
        setProcessing(null);
      }
    },
    [onRequestsChanged, refresh],
  );

  const handleReject = useCallback(
    async (row: IncomingRequestRow) => {
      setActionError(null);
      setProcessing({ requestId: row.requestId, action: 'reject' });
      try {
        await api.rejectProjectJoinRequest(row.requestId);
        setIncoming((prev) => prev.filter((r) => r.requestId !== row.requestId));
        onRequestsChanged?.();
      } catch {
        setActionError('Could not decline this request. Please try again.');
        await refresh();
      } finally {
        setProcessing(null);
      }
    },
    [onRequestsChanged, refresh],
  );

  const handleDismiss = useCallback(
    async (row: OutgoingRequestRow) => {
      setActionError(null);
      setDismissingId(row.requestId);
      try {
        await api.dismissJoinRequest(row.requestId);
        setOutgoing((prev) => prev.filter((r) => r.requestId !== row.requestId));
        onRequestsChanged?.();
      } catch {
        setActionError('Could not dismiss this request. Please try again.');
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

        {actionError ? (
          <p className="requests-modal__error" role="alert">
            {actionError}
          </p>
        ) : null}
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
                    {row.imageUrl ? (
                      <img
                        src={row.imageUrl}
                        alt={row.projectName}
                        className="requests-modal__avatar requests-modal__avatar--thumbnail"
                      />
                    ) : (
                      <div
                        className="requests-modal__avatar"
                        style={{ backgroundColor: avatarBgFromEmail(row.projectName) }}
                      >
                        {row.projectName.trim()[0]?.toUpperCase() ?? '?'}
                      </div>
                    )}
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

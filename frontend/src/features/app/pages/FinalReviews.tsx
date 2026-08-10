import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Check, ChevronRight, Clock, Video, X } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import { api, type ApiClassTA, type ApiFinalReviewSchedule, type ApiFinalReviewTeam } from '@/lib/api';
import { getInitials } from '@features/app/utils/memberUtils';
import { formatReviewTime as formatTime } from './finalReviewTemplate';
import { groupByDay } from './finalReviewsGrouping';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import '../components/TAManagement/TAManagement.scss';
import './FinalReviews.scss';

type ViewerRole = 'instructor' | 'ta' | 'student' | null;

/** ISO timestamptz → value for <input type="datetime-local"> (local wall clock). */
const toInputValue = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const Avatar: React.FC<{ name: string; email?: string | null }> = ({ name, email }) => (
  <span className="fr-avatar" aria-hidden="true">{getInitials(name || '', email || '')}</span>
);

/** Visually hidden but screen-reader-visible — no existing sr-only utility
 * class in this codebase, so this is inlined for the one aria-errormessage
 * target below rather than adding a new global class for a single use. */
const srOnlyStyle: React.CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0,
};

/**
 * Page-shaped loading placeholder: a title-bar block plus three day-section
 * stubs (a day-label block + three row-shaped blocks each), so the page
 * doesn't jump once the real schedule arrives.
 */
const FinalReviewsSkeleton: React.FC = () => (
  <div className="ta-page final-reviews">
    <div className="fr-skeleton" aria-busy="true">
      <Skeleton width={240} height={28} radius={6} />
      {Array.from({ length: 3 }).map((_, dayIdx) => (
        <div key={dayIdx} className="fr-skeleton__day">
          <Skeleton width={150} height={16} radius={4} />
          {Array.from({ length: 3 }).map((_, rowIdx) => (
            <Skeleton key={rowIdx} height={60} radius={10} />
          ))}
        </div>
      ))}
    </div>
  </div>
);

const FinalReviews: React.FC = () => {
  const { selectedClass } = useClass();
  const { user } = useAuth();
  const navigate = useNavigate();
  const classId = selectedClass?.id ?? null;
  const viewerId = user?.id ?? null;

  const [schedule, setSchedule] = useState<ApiFinalReviewSchedule | null>(null);
  const [role, setRole] = useState<ViewerRole>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Transient failure of a sign-up/edit action (the schedule itself is fine). */
  const [actionError, setActionError] = useState<string | null>(null);
  /** project_id (or a class-level token) with an in-flight mutation. */
  const [busy, setBusy] = useState<string | null>(null);

  const [taOptions, setTaOptions] = useState<ApiClassTA[]>([]);
  const [zoomEditing, setZoomEditing] = useState(false);
  const [zoomDraft, setZoomDraft] = useState('');
  /**
   * Per-row datetime-local drafts (instructor). Committed explicitly — on
   * Enter or the row's confirm button — never on blur; a plain blur (tabbing
   * or clicking away without confirming) reverts the draft to the saved
   * value instead, so a stray click can't silently commit a half-typed time.
   */
  const [timeDrafts, setTimeDrafts] = useState<Record<string, string>>({});
  /** project_id → true while its time draft fails to parse as a date. */
  const [timeInvalid, setTimeInvalid] = useState<Record<string, boolean>>({});
  /** project_id → that row's confirm-✓ button element, so the time input's
   * onBlur can tell "focus is moving to ✓" apart from "focus is leaving the
   * row" via e.relatedTarget (works for both mouse and keyboard — Tabbing
   * to ✓ fires a real blur before any click/keypress on the button would). */
  const confirmBtnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const isInstructor = role === 'instructor';
  const isTa = role === 'ta';

  const loadSchedule = useCallback(async () => {
    if (!classId) return;
    const [scheduleRes, roleRes] = await Promise.all([
      api.getFinalReviewSchedule(classId),
      api.getMyEnrollmentRole(classId).catch(() => ({ enrollment_role: null })),
    ]);
    setSchedule(scheduleRes);
    setRole((roleRes.enrollment_role as ViewerRole) ?? null);
    setTimeDrafts(Object.fromEntries(
      scheduleRes.teams.map((t) => [t.project_id, toInputValue(t.final_review_at)]),
    ));
    // Fresh server data supersedes any stale per-row validation state.
    setTimeInvalid({});
  }, [classId]);

  useEffect(() => {
    if (!classId) {
      setSchedule(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadSchedule()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the schedule');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, loadSchedule]);

  // Instructor: class TAs for the appoint/override dropdown.
  useEffect(() => {
    if (!isInstructor || !classId) {
      setTaOptions([]);
      return;
    }
    let cancelled = false;
    api.getClassTAs(classId)
      .then((res) => { if (!cancelled) setTaOptions(res.tas); })
      .catch(() => { if (!cancelled) setTaOptions([]); });
    return () => {
      cancelled = true;
    };
  }, [isInstructor, classId]);

  /** Run a mutation with busy/error handling, then refresh the schedule. */
  const mutate = useCallback(async (busyKey: string, fn: () => Promise<unknown>): Promise<boolean> => {
    setBusy(busyKey);
    setActionError(null);
    try {
      await fn();
      await loadSchedule();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong');
      // The slot may have been taken/changed by someone else — resync.
      await loadSchedule().catch(() => undefined);
      return false;
    } finally {
      setBusy(null);
    }
  }, [loadSchedule]);

  const handleSignUp = (projectId: string) =>
    mutate(projectId, () => api.setReviewTA(projectId));

  const handleRelease = (projectId: string, userId: string) =>
    mutate(projectId, () => api.releaseReviewTA(projectId, userId));

  const handleAppoint = (team: ApiFinalReviewTeam, taId: string) => {
    if (!taId && team.review_ta) {
      void handleRelease(team.project_id, team.review_ta.user_id);
      return;
    }
    if (taId) void mutate(team.project_id, () => api.setReviewTA(team.project_id, taId));
  };

  const handleToggleWindow = () => {
    if (!classId || !schedule) return;
    void mutate('window', () => api.setReviewWindow(classId, !schedule.review_period_open));
  };

  const handleSaveZoom = () => {
    if (!classId) return;
    void mutate('zoom', () => api.setReviewZoom(classId, zoomDraft.trim() || null))
      .then((ok) => { if (ok) setZoomEditing(false); });
  };

  /** Parse a datetime-local draft: '' → clear (null), invalid → undefined. */
  const parseTimeDraft = (draft: string): string | null | undefined => {
    if (!draft) return null;
    const d = new Date(draft);
    if (Number.isNaN(d.getTime())) return undefined;
    return d.toISOString();
  };

  /** Enter or the row's ✓ button — the only ways a time edit reaches the API. */
  const commitTime = (team: ApiFinalReviewTeam) => {
    const draft = timeDrafts[team.project_id] ?? '';
    if (draft === toInputValue(team.final_review_at)) {
      setTimeInvalid((prev) => (prev[team.project_id] ? { ...prev, [team.project_id]: false } : prev));
      return; // unchanged
    }
    // An emptied draft against a previously-scheduled time is NOT a valid
    // confirm-to-clear — the dedicated ✕ Clear button owns intentional
    // clears. Without this, selecting-all-and-deleting the input then
    // pressing Enter/✓ would silently wipe the schedule via parseTimeDraft's
    // '' → null. Flag it instead.
    if (draft === '' && team.final_review_at) {
      setTimeInvalid((prev) => ({ ...prev, [team.project_id]: true }));
      return;
    }
    const iso = parseTimeDraft(draft);
    if (iso === undefined) {
      // Unparseable — flag it and stop; never send a bad value to the API.
      setTimeInvalid((prev) => ({ ...prev, [team.project_id]: true }));
      return;
    }
    setTimeInvalid((prev) => (prev[team.project_id] ? { ...prev, [team.project_id]: false } : prev));
    void mutate(team.project_id, () => api.setFinalReviewTime(team.project_id, iso));
  };

  /** Plain blur (no Enter/✓) discards an uncommitted edit. */
  const revertTime = (team: ApiFinalReviewTeam) => {
    // A commit for this row is in flight (or just landed) — don't fight it;
    // the row will re-sync from the authoritative server response either way.
    if (busy === team.project_id) return;
    setTimeDrafts((prev) => ({ ...prev, [team.project_id]: toInputValue(team.final_review_at) }));
    setTimeInvalid((prev) => (prev[team.project_id] ? { ...prev, [team.project_id]: false } : prev));
  };

  const clearTime = (team: ApiFinalReviewTeam) => {
    if (!team.final_review_at) return;
    setTimeInvalid((prev) => (prev[team.project_id] ? { ...prev, [team.project_id]: false } : prev));
    void mutate(team.project_id, () => api.setFinalReviewTime(team.project_id, null));
  };

  const groups = useMemo(() => groupByDay(schedule?.teams ?? []), [schedule]);

  /** The Review-TA cell + its action for one row, by viewer role/state. */
  const renderReviewTaCell = (team: ApiFinalReviewTeam) => {
    const reviewer = team.review_ta;
    const viewerIsHomeTa = !!viewerId && team.home_ta?.user_id === viewerId;
    const viewerIsReviewer = !!viewerId && reviewer?.user_id === viewerId;
    const rowBusy = busy === team.project_id;

    if (isInstructor) {
      return (
        <select
          className="fr-row__ta-select"
          value={reviewer?.user_id ?? ''}
          disabled={rowBusy}
          onChange={(e) => handleAppoint(team, e.target.value)}
          aria-label={`Review TA for ${team.name ?? 'team'}`}
        >
          <option value="">Open</option>
          {taOptions
            .filter((t) => t.id !== team.home_ta?.user_id)
            .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          {/* Keep a demoted/foreign reviewer visible rather than blanking the select. */}
          {reviewer && !taOptions.some((t) => t.id === reviewer.user_id) && (
            <option value={reviewer.user_id}>{reviewer.name ?? 'TA'}</option>
          )}
        </select>
      );
    }

    if (reviewer) {
      return (
        <span className="fr-row__reviewer">
          <Avatar name={reviewer.name ?? 'TA'} email={reviewer.email} />
          <span className="fr-row__reviewer-name">
            {reviewer.name ?? 'TA'}
            {viewerIsReviewer && <span className="fr-row__you"> (you)</span>}
          </span>
          {viewerIsReviewer && (
            <button
              type="button"
              className="fr-btn fr-btn--release"
              disabled={rowBusy}
              onClick={() => void handleRelease(team.project_id, viewerId!)}
            >
              Release
            </button>
          )}
        </span>
      );
    }

    // Open slot.
    if (!isTa) return <span className="fr-row__open">Open</span>;
    if (viewerIsHomeTa) {
      return <span className="fr-row__hint">You&rsquo;re the Home TA</span>;
    }
    if (!schedule?.review_period_open) {
      return (
        <span className="fr-row__signup-wrap">
          <button type="button" className="fr-btn fr-btn--signup" disabled>
            Sign up to review
          </button>
          <span className="fr-row__hint">Sign-ups closed</span>
        </span>
      );
    }
    return (
      <button
        type="button"
        className="fr-btn fr-btn--signup"
        disabled={rowBusy}
        onClick={() => void handleSignUp(team.project_id)}
      >
        Sign up to review
      </button>
    );
  };

  if (!selectedClass) {
    return (
      <div className="ta-page final-reviews">
        <div className="ta-page__empty">
          <div>
            <h2>No Class Selected</h2>
            <p>Please select a class from the sidebar.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <FinalReviewsSkeleton />;
  }

  if (error || !schedule) {
    return (
      <div className="ta-page final-reviews">
        <div className="ta-page__empty">
          <div>
            <h2>Unable to load</h2>
            <p>{error ?? 'Failed to load the schedule'}</p>
          </div>
        </div>
      </div>
    );
  }

  const zoomUrl = schedule.review_zoom_url;

  return (
    <div className="ta-page final-reviews">
      <header className="ta-page__topbar">
        <div className="ta-page__heading">
          <h2 className="ta-page__title"><CalendarCheck size={20} /> Final Reviews</h2>
          <span className="ta-page__subtitle">End-of-quarter team reviews</span>
          {isTa && (
            <span className="fr-badge" data-testid="my-review-count">
              You&rsquo;re reviewing {schedule.my_review_count}{' '}
              {schedule.my_review_count === 1 ? 'team' : 'teams'}
            </span>
          )}
        </div>
        <div className="ta-page__topbar-actions">
          <span className={`fr-window ${schedule.review_period_open ? 'fr-window--open' : ''}`}>
            {schedule.review_period_open ? 'Sign-ups open' : 'Sign-ups closed'}
          </span>
          {isInstructor && (
            <button
              type="button"
              className="ta-page__manage-btn"
              disabled={busy === 'window'}
              onClick={handleToggleWindow}
            >
              {schedule.review_period_open ? 'Close sign-ups' : 'Open sign-ups'}
            </button>
          )}
        </div>
      </header>

      <div className="fr-zoom">
        <span className="fr-zoom__label"><Video size={16} /> Shared Zoom room</span>
        {zoomEditing ? (
          <span className="fr-zoom__edit">
            <input
              type="url"
              className="fr-zoom__input"
              placeholder="https://ucsc.zoom.us/j/…"
              value={zoomDraft}
              onChange={(e) => setZoomDraft(e.target.value)}
              autoFocus
            />
            <button type="button" className="fr-btn fr-btn--primary" disabled={busy === 'zoom'} onClick={handleSaveZoom}>
              Save
            </button>
            <button type="button" className="fr-btn" onClick={() => setZoomEditing(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <>
            {zoomUrl ? (
              <a className="fr-zoom__link" href={zoomUrl} target="_blank" rel="noreferrer">{zoomUrl}</a>
            ) : (
              <span className="fr-row__hint">Not set yet — all reviews use one shared room.</span>
            )}
            {isInstructor && (
              <button
                type="button"
                className="fr-btn"
                onClick={() => { setZoomDraft(zoomUrl ?? ''); setZoomEditing(true); }}
              >
                {zoomUrl ? 'Edit' : 'Set Zoom room'}
              </button>
            )}
          </>
        )}
      </div>

      {actionError && (
        <div className="fr-error" role="alert">
          <span>{actionError}</span>
          <button type="button" className="fr-error__close" onClick={() => setActionError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="ta-page__divider" />

      {groups.length === 0 ? (
        <div className="ta-page__empty ta-page__empty--stack">
          <p className="ta-page__empty-text">
            No teams in this class yet. The schedule fills in once teams exist
            {isInstructor ? ' and you set each team’s review time.' : '.'}
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.key} className="fr-day">
            <div className="fr-day__head">
              <span className="fr-day__title">{group.label ?? 'Unscheduled'}</span>
              <span className="ta-page__count">{group.teams.length}</span>
              {group.label && zoomUrl && (
                <a className="fr-day__zoom" href={zoomUrl} target="_blank" rel="noreferrer">
                  <Video size={14} /> Join Zoom
                </a>
              )}
            </div>
            <div className="fr-day__list">
              {group.teams.map((team) => {
                const when = team.final_review_at ? new Date(team.final_review_at) : null;
                return (
                  <div key={team.project_id} className="fr-row">
                    <div className="fr-row__cell fr-row__cell--time">
                      <span className="fr-row__label">Time</span>
                      {isInstructor ? (
                        <span className="fr-row__time-edit">
                          <input
                            type="datetime-local"
                            className="fr-row__time-input"
                            value={timeDrafts[team.project_id] ?? ''}
                            disabled={busy === team.project_id}
                            onChange={(e) => {
                              const value = e.target.value;
                              setTimeDrafts((prev) => ({ ...prev, [team.project_id]: value }));
                              setTimeInvalid((prev) => (prev[team.project_id] ? { ...prev, [team.project_id]: false } : prev));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitTime(team);
                              }
                            }}
                            onBlur={(e) => {
                              // Focus moving to this row's own ✓ button is not
                              // an abandoned edit — skip the revert so a
                              // keyboard user Tabbing to ✓ (a real blur, with
                              // no mouse event to intercept) still gets to
                              // commit what they typed instead of it being
                              // silently reverted first.
                              if (e.relatedTarget === confirmBtnRefs.current[team.project_id]) return;
                              revertTime(team);
                            }}
                            aria-invalid={timeInvalid[team.project_id] ? 'true' : undefined}
                            aria-errormessage={timeInvalid[team.project_id] ? `time-error-${team.project_id}` : undefined}
                            aria-label={`Review time for ${team.name ?? 'team'}`}
                          />
                          {timeInvalid[team.project_id] && (
                            <span id={`time-error-${team.project_id}`} style={srOnlyStyle}>
                              Invalid or unconfirmable time — use ✕ to clear the schedule instead.
                            </span>
                          )}
                          <button
                            ref={(el) => { confirmBtnRefs.current[team.project_id] = el; }}
                            type="button"
                            className="fr-row__time-confirm"
                            title="Confirm time"
                            aria-label={`Confirm review time for ${team.name ?? 'team'}`}
                            disabled={busy === team.project_id
                              || (timeDrafts[team.project_id] ?? '') === toInputValue(team.final_review_at)}
                            // Composes with the input's relatedTarget-aware
                            // onBlur above, covering the two ways focus can
                            // leave the input on a click: on browsers where a
                            // <button> takes focus on click (jsdom's default,
                            // Chromium), the resulting blur's relatedTarget IS
                            // this button, which onBlur already recognizes and
                            // skips reverting for. But on macOS Safari/Firefox
                            // — where a plain <button> does NOT take focus on
                            // click — the input would still blur (its default
                            // "unfocus" action, since focus isn't moving
                            // anywhere focusable), only now with
                            // relatedTarget === null, which onBlur can't
                            // recognize, so it would revert; the disabled
                            // check above would then grey the button out
                            // mid-gesture, killing the click before it fires.
                            // preventDefault() here stops that default
                            // "unfocus" action outright, so the input never
                            // blurs at all for a pointer-driven click, on any
                            // browser.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => commitTime(team)}
                          >
                            <Check size={14} />
                          </button>
                          {team.final_review_at && (
                            <button
                              type="button"
                              className="fr-row__time-clear"
                              title="Clear time"
                              aria-label={`Clear review time for ${team.name ?? 'team'}`}
                              disabled={busy === team.project_id}
                              onClick={() => clearTime(team)}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="fr-row__value">
                          <Clock size={15} className="fr-row__icon" />
                          {when ? formatTime(when) : <span className="fr-row__hint">Not scheduled</span>}
                        </span>
                      )}
                    </div>
                    <div className="fr-row__cell fr-row__cell--team">
                      <span className="fr-row__label">Team</span>
                      <span className="fr-row__value fr-row__team">{team.name ?? 'Untitled team'}</span>
                    </div>
                    <div className="fr-row__cell">
                      <span className="fr-row__label">Home TA</span>
                      {team.home_ta ? (
                        <span className="fr-row__value">
                          <Avatar name={team.home_ta.name ?? 'TA'} email={team.home_ta.email} />
                          {team.home_ta.name ?? 'TA'}
                          {viewerId && team.home_ta.user_id === viewerId && <span className="fr-row__you"> (you)</span>}
                        </span>
                      ) : (
                        <span className="fr-row__hint">Unassigned</span>
                      )}
                    </div>
                    <div className="fr-row__cell fr-row__cell--reviewer">
                      <span className="fr-row__label">Review TA</span>
                      {renderReviewTaCell(team)}
                    </div>
                    <button
                      type="button"
                      className="fr-row__open-btn"
                      title="Open scores & review notes"
                      onClick={() => navigate(`/app/ta-review/final-reviews/${team.project_id}`)}
                    >
                      Review <ChevronRight size={15} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
};

export default FinalReviews;

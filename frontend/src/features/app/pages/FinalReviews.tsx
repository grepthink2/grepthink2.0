import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ChevronRight, Clock, Video, X } from 'lucide-react';
import { useClass, useSelectedClassRole } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import { api, type ApiClassTA, type ApiFinalReviewSchedule, type ApiFinalReviewTeam } from '@/lib/api';
import { getInitials } from '@features/app/utils/memberUtils';
import { formatReviewTime as formatTime } from './finalReviewTemplate';
import { groupByDay } from './finalReviewsGrouping';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import '../components/TAManagement/TAManagement.scss';
import './FinalReviews.scss';

/** Why a TA can't sign up to review a team yet: the backend's refusal, word for word. */
const NO_SLOT_HINT = "This team hasn't booked a review slot yet.";

const Avatar: React.FC<{ name: string; email?: string | null }> = ({ name, email }) => (
  <span className="fr-avatar" aria-hidden="true">{getInitials(name || '', email || '')}</span>
);

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
  const viewerRole = useSelectedClassRole();
  const { user } = useAuth();
  const navigate = useNavigate();
  const classId = selectedClass?.id ?? null;
  const viewerId = user?.id ?? null;

  const [schedule, setSchedule] = useState<ApiFinalReviewSchedule | null>(null);
  /** The class of the schedule request that last settled, and its error. */
  const [loaded, setLoaded] = useState<{ classId: string; error: string | null } | null>(null);
  const loading = classId !== null && loaded?.classId !== classId;
  const error = loading ? null : (loaded?.error ?? null);
  /** Transient failure of a sign-up/edit action (the schedule itself is fine). */
  const [actionError, setActionError] = useState<string | null>(null);
  /** project_id (or a class-level token) with an in-flight mutation. */
  const [busy, setBusy] = useState<string | null>(null);

  const [taOptions, setTaOptions] = useState<ApiClassTA[]>([]);
  const [zoomEditing, setZoomEditing] = useState(false);
  const [zoomDraft, setZoomDraft] = useState('');

  const isInstructor = viewerRole === 'instructor';
  const isTa = viewerRole === 'ta';

  /** Refetches after a mutation; the page stays on screen while it runs. */
  const loadSchedule = useCallback(async () => {
    if (!classId) return;
    setSchedule(await api.getFinalReviewSchedule(classId));
  }, [classId]);

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    api.getFinalReviewSchedule(classId)
      .then((scheduleRes) => {
        if (cancelled) return;
        setSchedule(scheduleRes);
        setLoaded({ classId, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setLoaded({
          classId,
          error: err instanceof Error ? err.message : 'Failed to load the schedule',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  // Instructor: class TAs for the appoint/override dropdown. Anyone else (or
  // no class) gets an empty list.
  if ((!isInstructor || !classId) && taOptions.length > 0) {
    setTaOptions([]);
  }
  useEffect(() => {
    if (!isInstructor || !classId) return;
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
      // The Review TA seat may have been taken/changed by someone else — resync.
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

    // Open Review TA seat.
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
    // A TA can review a team only once it holds a slot (the instructor can appoint at any time).
    if (!team.final_review_at) {
      const hintId = `fr-no-slot-${team.project_id}`;
      return (
        <span className="fr-row__signup-wrap">
          <button type="button" className="fr-btn fr-btn--signup" disabled aria-describedby={hintId}>
            Sign up to review
          </button>
          <span id={hintId} className="fr-row__hint">{NO_SLOT_HINT}</span>
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
            No teams in this class yet. The schedule fills in once teams book review slots.
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
                      <span className="fr-row__value">
                        <Clock size={15} className="fr-row__icon" />
                        {when ? formatTime(when) : <span className="fr-row__hint">Not scheduled</span>}
                      </span>
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

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  PlusCircle,
  Sparkles,
  UserX,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useClass, type Class } from '@/lib/classContext';
import { api } from '@/lib/api';
import { lazyModal } from '@/lib/lazyModal';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { buildAttentionItems, type AttentionItem } from './attentionItems';
import './InstructorHomeDashboard.scss';

// Loads on first open; the form pulls in the date picker.
const CreateClassModal = lazyModal(
  () => import('@features/app/components/Classes/CreateClassModal'),
  (p) => p.isOpen,
);

function courseLabel(cls: Class): string {
  const parts = [cls.year ? String(cls.year) : '', cls.term].filter(Boolean);
  return parts.join(' ').trim();
}

const DISMISSED_ALERTS_KEY = 'gt:instructor:dismissed-alerts';

const NO_ALERTS: AttentionItem[] = [];

function loadDismissedAlerts(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_ALERTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function persistDismissedAlerts(ids: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_ALERTS_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore storage failures */
  }
}

const InstructorHomeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { visibleClasses, setSelectedClass, getClassStatus } = useClass();
  // Teaching the selected class is not the same as being allowed to create one (POST
  // /api/classes answers 403 then), so Create Class follows the account, as in My Classes.
  const { canCreateClasses } = useAuth();

  // The alerts last built, and the active-class list they were built for.
  const [alertsResult, setAlertsResult] = useState<{
    classes: Class[];
    alerts: AttentionItem[];
  } | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(loadDismissedAlerts);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);

  // The active classes you teach are the ones worth triaging for "needs attention" (the summary
  // covers only classes you created); classes you TA or take are not listed here.
  const activeClasses = useMemo(
    () => visibleClasses.filter((c) => c.my_role === 'instructor' && getClassStatus(c) === 'active'),
    [visibleClasses, getClassStatus],
  );

  // No active classes means no alerts.
  if (activeClasses.length === 0 && alertsResult !== null) {
    setAlertsResult(null);
  }
  // Each new active-class list (a class refresh) loads the summary again; the
  // previous alerts stay counted until it lands.
  const alertsLoading = activeClasses.length > 0 && alertsResult?.classes !== activeClasses;
  const alerts = alertsResult?.alerts ?? NO_ALERTS;

  useEffect(() => {
    if (activeClasses.length === 0) return;

    let cancelled = false;

    const load = async () => {
      let items: AttentionItem[] = [];
      try {
        const { classes } = await api.getClassesAttentionSummary();
        items = buildAttentionItems(activeClasses, classes);
      } catch {
        // No alerts: the card shows its all-clear state.
      }
      if (!cancelled) setAlertsResult({ classes: activeClasses, alerts: items });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeClasses]);

  // Alerts the user hasn't dismissed. Dismissals persist across reloads; an
  // alert reappears only if it's a brand-new issue (different id).
  const visibleAlerts = useMemo(
    () => alerts.filter((a) => !dismissedIds.has(a.id)),
    [alerts, dismissedIds],
  );

  const handleOpenClass = (cls: Class) => {
    setSelectedClass(cls);
    navigate('/app/dashboard');
  };

  const handleAlertClick = (item: AttentionItem) => {
    const cls = visibleClasses.find((c) => c.id === item.classId);
    if (cls) setSelectedClass(cls);
    navigate('/app/roster');
  };

  const handleDismissAlert = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistDismissedAlerts(next);
      return next;
    });
  };

  return (
    <div className="instructor-home">
      <div className="instructor-home__grid">
        {/* ── Main column ── */}
        <div className="instructor-home__column">
          <section
            className="instructor-home__card"
            aria-labelledby="attention-heading"
          >
            <div className="instructor-home__card-header">
              <h2 id="attention-heading" className="instructor-home__card-title">
                <AlertCircle size={18} aria-hidden /> Needs Attention
              </h2>
              {visibleAlerts.length > 0 && (
                <span className="instructor-home__count-badge">{visibleAlerts.length}</span>
              )}
            </div>

            {alertsLoading ? (
              <ul className="instructor-home__alert-list" aria-busy="true">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li key={i} className="instructor-home__alert">
                    <div className="instructor-home__alert-main">
                      <Skeleton circle height={18} />
                      <span className="instructor-home__alert-text">
                        <Skeleton width="40%" height={13} />
                        <Skeleton width="70%" height={12} style={{ marginTop: 6 }} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : visibleAlerts.length === 0 ? (
              <div className="instructor-home__all-clear">
                <span className="instructor-home__all-clear-icon" aria-hidden>
                  <CheckCircle2 size={26} />
                </span>
                <p className="instructor-home__all-clear-title">All caught up</p>
                <p className="instructor-home__all-clear-sub">Nothing needs your attention right now.</p>
              </div>
            ) : (
              <ul className="instructor-home__alert-list">
                {visibleAlerts.map((item) => {
                  const Icon = item.type === 'roster_missing' ? AlertTriangle : UserX;
                  return (
                    <li
                      key={item.id}
                      className={`instructor-home__alert instructor-home__alert--${item.type}`}
                    >
                      <button
                        type="button"
                        className="instructor-home__alert-main"
                        onClick={() => handleAlertClick(item)}
                      >
                        <Icon
                          size={18}
                          className="instructor-home__alert-icon"
                          aria-hidden
                        />
                        <span className="instructor-home__alert-text">
                          <span className="instructor-home__alert-class">{item.className}</span>
                          <span className="instructor-home__alert-msg">{item.message}</span>
                        </span>
                        <ChevronRight
                          size={16}
                          className="instructor-home__alert-chevron"
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        className="instructor-home__alert-dismiss"
                        onClick={() => handleDismissAlert(item.id)}
                        aria-label={`Dismiss alert for ${item.className}`}
                        title="Dismiss"
                      >
                        <X size={16} aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            className="instructor-home__card instructor-home__card--activity"
            aria-labelledby="activity-heading"
          >
            <div className="instructor-home__card-header">
              <h2 id="activity-heading" className="instructor-home__card-title">
                <Activity size={18} aria-hidden /> Recent Activity
              </h2>
            </div>
            {/* TODO: wire a real activity feed (enrollments, new projects, TSR
                submissions, assignment publishes) once an event source exists. */}
            <div className="instructor-home__activity-empty">
              <Sparkles size={22} aria-hidden />
              <p>Activity will appear here as your classes get going.</p>
            </div>
          </section>
        </div>

        {/* ── Aside column ── */}
        <div className="instructor-home__column">
          {canCreateClasses && (
            <button
              type="button"
              className="add-assignment-btn instructor-home__create-btn"
              onClick={() => setIsCreateClassOpen(true)}
            >
              <PlusCircle size={16} aria-hidden />
              Create Class
            </button>
          )}

          <section className="instructor-home__card" aria-labelledby="classes-heading">
            <div className="instructor-home__card-header">
              <h2 id="classes-heading" className="instructor-home__card-title">
                <GraduationCap size={18} aria-hidden /> Active Classes
              </h2>
            </div>

            {activeClasses.length === 0 ? (
              <p className="instructor-home__muted">
                {canCreateClasses
                  ? 'No active classes. Create one or reactivate a class from My Classes.'
                  : 'No active classes. Reactivate a class from My Classes.'}
              </p>
            ) : (
              <ul className="instructor-home__class-list">
                {activeClasses.map((cls) => {
                  const status = getClassStatus(cls);
                  const term = courseLabel(cls);
                  return (
                    <li key={cls.id}>
                      <button
                        type="button"
                        className="instructor-home__class-row"
                        onClick={() => handleOpenClass(cls)}
                        aria-label={`Open ${cls.name} dashboard`}
                      >
                        <div className="instructor-home__class-main">
                          <span className="instructor-home__class-name">{cls.name}</span>
                          <span className="instructor-home__class-meta">
                            {term && <span>{term}</span>}
                            <span>
                              {cls.enrolled_count ?? 0}{' '}
                              {cls.enrolled_count === 1 ? 'student' : 'students'}
                            </span>
                          </span>
                        </div>
                        <span
                          className={`instructor-home__status-tag instructor-home__status-tag--${status}`}
                        >
                          {status === 'complete' ? 'Completed' : 'Active'}
                        </span>
                        <ArrowRight
                          size={16}
                          className="instructor-home__class-arrow"
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {canCreateClasses && (
        <CreateClassModal
          isOpen={isCreateClassOpen}
          onClose={() => setIsCreateClassOpen(false)}
        />
      )}
    </div>
  );
};

export default InstructorHomeDashboard;

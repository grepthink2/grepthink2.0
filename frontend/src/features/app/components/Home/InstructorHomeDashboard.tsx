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
import { useClass, type Class } from '@/lib/classContext';
import { api } from '@/lib/api';
import CreateClassModal from '@features/app/components/Classes/CreateClassModal';
import { summarizeRoster } from '@features/app/components/Dashboard/dashboardData';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './InstructorHomeDashboard.scss';

type AttentionType = 'roster_missing' | 'unmatched';

interface AttentionItem {
  id: string;
  classId: string;
  className: string;
  type: AttentionType;
  message: string;
}

function courseLabel(cls: Class): string {
  const parts = [cls.year ? String(cls.year) : '', cls.term].filter(Boolean);
  return parts.join(' ').trim();
}

const DISMISSED_ALERTS_KEY = 'gt:instructor:dismissed-alerts';

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

  const [alerts, setAlerts] = useState<AttentionItem[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(loadDismissedAlerts);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);

  // Active classes are the ones worth triaging for "needs attention".
  const activeClasses = useMemo(
    () => visibleClasses.filter((c) => getClassStatus(c) === 'active'),
    [visibleClasses, getClassStatus],
  );

  useEffect(() => {
    if (activeClasses.length === 0) {
      setAlerts([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setAlertsLoading(true);
      try {
        const perClass = await Promise.all(
          activeClasses.map(async (cls) => {
            try {
              const { students, uploaded_at } = await api.getClassRoster(cls.id);
              const items: AttentionItem[] = [];
              if (!uploaded_at) {
                items.push({
                  id: `${cls.id}:roster_missing`,
                  classId: cls.id,
                  className: cls.name,
                  type: 'roster_missing',
                  message: 'No official roster uploaded yet',
                });
              }
              const { notOnRoster } = summarizeRoster(students);
              if (notOnRoster > 0) {
                items.push({
                  id: `${cls.id}:unmatched`,
                  classId: cls.id,
                  className: cls.name,
                  type: 'unmatched',
                  message: `${notOnRoster} student${notOnRoster === 1 ? '' : 's'} registered but not on the roster`,
                });
              }
              return items;
            } catch {
              return [];
            }
          }),
        );
        if (cancelled) return;
        setAlerts(perClass.flat());
      } finally {
        if (!cancelled) setAlertsLoading(false);
      }
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
          <button
            type="button"
            className="add-assignment-btn instructor-home__create-btn"
            onClick={() => setIsCreateClassOpen(true)}
          >
            <PlusCircle size={16} aria-hidden />
            Create Class
          </button>

          <section className="instructor-home__card" aria-labelledby="classes-heading">
            <div className="instructor-home__card-header">
              <h2 id="classes-heading" className="instructor-home__card-title">
                <GraduationCap size={18} aria-hidden /> Active Classes
              </h2>
            </div>

            {activeClasses.length === 0 ? (
              <p className="instructor-home__muted">
                No active classes. Create one or reactivate a class from My Classes.
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

      <CreateClassModal
        isOpen={isCreateClassOpen}
        onClose={() => setIsCreateClassOpen(false)}
      />
    </div>
  );
};

export default InstructorHomeDashboard;

import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { format, parseISO } from 'date-fns';
import { X, Loader2 } from 'lucide-react';
import { api, type ApiRosterTimelineStudent } from '@/lib/api';
import './RosterTimelineModal.scss';

interface RosterTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

const RosterTimelineModal: React.FC<RosterTimelineModalProps> = ({
  isOpen,
  onClose,
  classId,
}) => {
  const [rows, setRows] = useState<ApiRosterTimelineStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); },
    [handleClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  useEffect(() => {
    if (!isOpen || !classId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows([]);

    api.getClassRosterTimeline(classId)
      .then(({ students }) => {
        if (!cancelled) setRows(students);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load timeline');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, classId]);

  if (!isOpen) return null;

  const modal = (
    <div
      className="roster-timeline-modal__overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="roster-timeline-title"
    >
      <div className="roster-timeline-modal">
        <header className="roster-timeline-modal__header">
          <div>
            <h2 id="roster-timeline-title" className="roster-timeline-modal__title">
              Enrollment Timeline
            </h2>
            <p className="roster-timeline-modal__subtitle">
              When each student joined the course, joined a team, or was marked dropped on the roster.
            </p>
          </div>
          <button
            type="button"
            className="roster-timeline-modal__close"
            onClick={handleClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="roster-timeline-modal__body">
          {loading && (
            <div className="roster-timeline-modal__state">
              <Loader2 size={20} className="roster-timeline-modal__spinner" />
              <span>Loading timeline…</span>
            </div>
          )}

          {!loading && error && (
            <p className="roster-timeline-modal__error" role="alert">{error}</p>
          )}

          {!loading && !error && rows.length === 0 && (
            <p className="roster-timeline-modal__empty">No students on the roster yet.</p>
          )}

          {!loading && !error && rows.length > 0 && (
            <div className="roster-timeline-modal__table-wrap">
              <table className="roster-timeline-modal__table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Joined course</th>
                    <th>Joined team</th>
                    <th>Dropped</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className="roster-timeline-modal__name">{row.name}</span>
                        <span className="roster-timeline-modal__email">{row.email}</span>
                      </td>
                      <td>{formatTimestamp(row.enrolled_at)}</td>
                      <td>
                        {row.team_joined_at ? (
                          <>
                            {formatTimestamp(row.team_joined_at)}
                            {row.project_name && (
                              <span className="roster-timeline-modal__project">
                                {row.project_name}
                              </span>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{formatTimestamp(row.dropped_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="roster-timeline-modal__footer">
          <button
            type="button"
            className="roster-timeline-modal__btn roster-timeline-modal__btn--close"
            onClick={handleClose}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
};

export default RosterTimelineModal;

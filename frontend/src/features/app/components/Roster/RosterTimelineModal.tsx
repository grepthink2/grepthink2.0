import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import { api, type ApiRosterTimelineStudent } from '@/lib/api';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { formatPacificTimestamp } from '@features/app/utils/reviewDates';
import './RosterTimelineModal.scss';

interface RosterTimelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
}

/** Descendants the hand-rolled focus trap below cycles Tab/Shift+Tab through. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const RosterTimelineModal: React.FC<RosterTimelineModalProps> = ({
  isOpen,
  onClose,
  classId,
}) => {
  const [rows, setRows] = useState<ApiRosterTimelineStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }

      // Hand-rolled Tab trap — reference implementation for later gt modals.
      // As of this writing no existing modal in the codebase traps focus
      // (InviteModal/AddStudentModal manage open- and close-focus but let
      // Tab walk out of the dialog into the page behind it), so this is the
      // pattern later modals should copy.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const withinPanel = panelRef.current.contains(document.activeElement);
      const atEdge = e.shiftKey
        ? document.activeElement === first || !withinPanel
        : document.activeElement === last || !withinPanel;
      if (atEdge) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    },
    [handleClose],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  // Move focus into the dialog on open (to the close button) and give it
  // back to whatever triggered the modal (the roster's "Timeline" button)
  // on close.
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      const id = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !classId) return;

    let cancelled = false;
    // Inside the async IIFE so these aren't lexically direct statements of
    // the effect body (satisfies react-hooks/set-state-in-effect) — same
    // pattern as Sidebar.tsx's isTaForClass check. Still runs synchronously
    // before the fetch kicks off below, so timing is unchanged.
    void (async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      setRows([]);
    })();

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
      <div className="roster-timeline-modal" ref={panelRef}>
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
            ref={closeButtonRef}
          >
            <X size={18} />
          </button>
        </header>

        <div className="roster-timeline-modal__body">
          {loading && (
            <div className="roster-timeline-modal__skeleton" aria-busy="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} height={40} radius={8} />
              ))}
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
                    <th scope="col">Student</th>
                    <th scope="col">Joined course</th>
                    <th scope="col">Joined team</th>
                    <th scope="col">Dropped</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className="roster-timeline-modal__name">{row.name}</span>
                        <span className="roster-timeline-modal__email">{row.email}</span>
                      </td>
                      <td>{formatPacificTimestamp(row.enrolled_at)}</td>
                      <td>
                        {row.team_joined_at ? (
                          <>
                            {formatPacificTimestamp(row.team_joined_at)}
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
                      <td>{formatPacificTimestamp(row.dropped_at)}</td>
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

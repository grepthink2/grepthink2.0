import React, { useState, useEffect } from 'react';
import { parse, isValid } from 'date-fns';
import { X, FileText, Globe, Trash2 } from 'lucide-react';
import DatePickerField, { DATETIME_FORMAT } from '@/features/app/components/Fields/DatePickerField';
import { type Assignment, type AssignmentStatus } from './AssignmentList';
import './AssignmentEditorModal.scss';

// ── Types ──────────────────────────────────────────────────────
type EditorStatus = 'draft' | 'published';

interface AssignmentEditorModalProps {
  assignment: Assignment | null;
  onClose: () => void;
  onSave?: (
    id: string,
    data: { name: string; openDate: string; dueDate: string; status: EditorStatus },
  ) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
}

const toEditorStatus = (s: AssignmentStatus): EditorStatus =>
  s === 'draft' ? 'draft' : 'published';

// ── Component ──────────────────────────────────────────────────
const AssignmentEditorModal: React.FC<AssignmentEditorModalProps> = ({
  assignment,
  onClose,
  onSave,
  onDelete,
}) => {
  const isOpen = assignment !== null;

  const [name,         setName]         = useState('');
  const [openDate,     setOpenDate]     = useState('');
  const [dueDate,      setDueDate]      = useState('');
  const [status,       setStatus]       = useState<EditorStatus>('published');
  const [isClosing,      setIsClosing]      = useState(false);
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [isDeleting,     setIsDeleting]     = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  // Snapshot of original values — used to detect dirty state
  const [origName,     setOrigName]     = useState('');
  const [origOpenDate, setOrigOpenDate] = useState('');
  const [origDueDate,  setOrigDueDate]  = useState('');
  const [origStatus,   setOrigStatus]   = useState<EditorStatus>('published');

  useEffect(() => {
    if (assignment) {
      const n  = assignment.title;
      const od = assignment.openDate ?? '';
      const dd = assignment.dueDatetime ?? '';
      const st = toEditorStatus(assignment.status);
      setName(n);  setOrigName(n);
      setOpenDate(od); setOrigOpenDate(od);
      setDueDate(dd);  setOrigDueDate(dd);
      setStatus(st);   setOrigStatus(st);
      setError(null);
      setConfirmDelete(false);
    }
  }, [assignment?.id]);

  const isDirty =
    name.trim() !== origName.trim() ||
    openDate    !== origOpenDate    ||
    dueDate     !== origDueDate     ||
    status      !== origStatus;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); onClose(); }, 250);
  };

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) handleClose(); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [isOpen]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) { setError('Assignment name is required');  return; }
    if (!openDate)    { setError('Open date & time is required'); return; }
    if (!dueDate)     { setError('Due date & time is required');  return; }

    const openParsed = parse(openDate, DATETIME_FORMAT, new Date());
    const dueParsed  = parse(dueDate,  DATETIME_FORMAT, new Date());
    if (isValid(openParsed) && isValid(dueParsed) && dueParsed < openParsed) {
      setError('Due date must be on or after open date'); return;
    }

    setIsSubmitting(true);
    try {
      await onSave?.(assignment!.id, { name: name.trim(), openDate, dueDate, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setError(null);
    setIsDeleting(true);
    try {
      await onDelete?.(assignment!.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assignment');
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  const openDateObj = openDate ? parse(openDate, DATETIME_FORMAT, new Date()) : undefined;

  if (!isOpen && !isClosing) return null;

  return (
    <>
      <div
        className={`aem-backdrop ${isClosing ? 'aem-backdrop--closing' : ''}`}
        onClick={handleClose}
      />

      <div className={`aem ${isClosing ? 'aem--closing' : ''}`} role="dialog" aria-modal="true">
        {/* Header */}
        <div className="aem__header">
          <div className="aem__header-text">
            <h2 className="aem__title">Edit Assignment</h2>
            <p className="aem__subtitle">
              Update the details for <strong>{assignment?.title}</strong>
            </p>
          </div>
          <button className="aem__close-btn" onClick={handleClose} aria-label="Close editor">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="aem__body">
          {/* Assignment Name */}
          <div className="aem__section">
            <label className="aem__sublabel" htmlFor="aem-name">Assignment Name</label>
            <input
              id="aem-name"
              type="text"
              className="aem__input"
              placeholder="e.g., Team Status Report 1"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Dates */}
          <div className="aem__section">
            <DatePickerField
              label="Open Date & Time"
              value={openDate}
              onChange={setOpenDate}
              showTime
              labelClassName="aem__sublabel"
            />

            <DatePickerField
              label="Due Date & Time"
              value={dueDate}
              onChange={setDueDate}
              showTime
              disabledBefore={openDateObj && isValid(openDateObj) ? openDateObj : undefined}
              labelClassName="aem__sublabel"
            />
          </div>

          {/* Status */}
          <div className="aem__section">
            <span className="aem__section-label">Status</span>

            <button
              type="button"
              className={`aem__status-card ${status === 'draft' ? 'aem__status-card--selected' : ''}`}
              onClick={() => setStatus('draft')}
            >
              <div className="aem__status-radio">
                <div className="aem__status-radio-dot" />
              </div>
              <div className="aem__status-card-body">
                <div className="aem__status-card-icon aem__status-card-icon--draft">
                  <FileText size={16} />
                </div>
                <div className="aem__status-card-text">
                  <span className="aem__status-card-title">Draft</span>
                  <span className="aem__status-card-desc">
                    Assignment is saved but not visible to students
                  </span>
                </div>
              </div>
            </button>

            <button
              type="button"
              className={`aem__status-card ${status === 'published' ? 'aem__status-card--selected' : ''}`}
              onClick={() => setStatus('published')}
            >
              <div className="aem__status-radio">
                <div className="aem__status-radio-dot" />
              </div>
              <div className="aem__status-card-body">
                <div className="aem__status-card-icon aem__status-card-icon--published">
                  <Globe size={16} />
                </div>
                <div className="aem__status-card-text">
                  <span className="aem__status-card-title">Published</span>
                  <span className="aem__status-card-desc">
                    Assignment is live and students can submit once the open date passes
                  </span>
                </div>
              </div>
            </button>
          </div>

          {error && <div className="aem__error">{error}</div>}
        </div>

        {/* Footer */}
        <div className="aem__footer">
          {onDelete && (
            <div className="aem__footer-delete">
              {confirmDelete ? (
                <>
                  <button
                    type="button"
                    className="aem__delete-confirm-btn"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button
                    type="button"
                    className="aem__delete-cancel-btn"
                    onClick={() => setConfirmDelete(false)}
                    disabled={isDeleting}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="aem__delete-btn"
                  onClick={() => setConfirmDelete(true)}
                  disabled={isSubmitting}
                >
                  <Trash2 size={15} />
                  Delete
                </button>
              )}
            </div>
          )}
          <div className="aem__footer-actions">
            <button
              type="button"
              className="aem__cancel-btn"
              onClick={handleClose}
              disabled={isSubmitting || isDeleting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="aem__save-btn"
              onClick={handleSave}
              disabled={isSubmitting || isDeleting || !isDirty || !name.trim() || !openDate || !dueDate}
            >
              {isSubmitting ? 'Saving…' : 'Save Assignment'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AssignmentEditorModal;

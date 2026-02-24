import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parse, isValid } from 'date-fns';
import { X, CalendarDays, Clock, ChevronLeft, ChevronRight, FileText, Globe } from 'lucide-react';
import 'react-day-picker/dist/style.css';
import { type Assignment, type AssignmentStatus } from './AssignmentList';
import './AssignmentEditorModal.scss';

// ── Datetime helpers ───────────────────────────────────────────
const DT_FORMAT      = 'yyyy-MM-dd HH:mm';
const DATE_ONLY      = 'yyyy-MM-dd';
const DISPLAY_FORMAT = "MMM d, yyyy 'at' h:mm a";

// ── Inline DateTimePickerField ─────────────────────────────────
interface DateTimePickerFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  disabledBefore?: Date;
}

const DateTimePickerField: React.FC<DateTimePickerFieldProps> = ({
  label,
  value,
  onChange,
  disabledBefore,
}) => {
  const [open, setOpen]           = useState(false);
  const [popoverDir, setPopoverDir] = useState<'down' | 'up'>('down');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef   = useRef<HTMLButtonElement>(null);
  const popoverRef   = useRef<HTMLDivElement>(null);
  const timeRef      = useRef<HTMLInputElement>(null);

  const parsed    = value ? parse(value, DT_FORMAT, new Date()) : undefined;
  const validDate = parsed && isValid(parsed) ? parsed : undefined;

  const selectedDay  = validDate
    ? new Date(validDate.getFullYear(), validDate.getMonth(), validDate.getDate())
    : undefined;
  const selectedTime = validDate
    ? `${String(validDate.getHours()).padStart(2, '0')}:${String(validDate.getMinutes()).padStart(2, '0')}`
    : '08:00';

  const displayText = validDate ? format(validDate, DISPLAY_FORMAT) : 'Select date & time';

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect       = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setPopoverDir(spaceBelow < 360 && spaceAbove > spaceBelow ? 'up' : 'down');
  }, [open]);

  useEffect(() => {
    if (timeRef.current && timeRef.current !== document.activeElement) {
      timeRef.current.value = selectedTime;
    }
  }, [selectedTime]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const dateStr = format(day, DATE_ONLY);
    onChange(`${dateStr} ${selectedTime}`);
  };

  const handleTimeChange = (time: string) => {
    const dateStr = selectedDay ? format(selectedDay, DATE_ONLY) : format(new Date(), DATE_ONLY);
    onChange(`${dateStr} ${time}`);
  };

  return (
    <div className="aem-date-field" ref={containerRef}>
      <label className="aem__sublabel">{label}</label>

      <button
        ref={triggerRef}
        type="button"
        className={[
          'aem-date-field__trigger',
          open  ? 'aem-date-field__trigger--open'   : '',
          value ? 'aem-date-field__trigger--filled' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setOpen(v => !v)}
        aria-label={`Pick ${label}`}
      >
        <span className="aem-date-field__text">{displayText}</span>
        <CalendarDays size={16} className="aem-date-field__icon" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={`aem-date-field__popover aem-date-field__popover--${popoverDir}`}
        >
          <DayPicker
            mode="single"
            selected={selectedDay}
            onSelect={handleDaySelect}
            defaultMonth={selectedDay ?? new Date()}
            disabled={disabledBefore ? { before: disabledBefore } : undefined}
            components={{
              Chevron: ({ orientation }) =>
                orientation === 'left'
                  ? <ChevronLeft size={16} />
                  : <ChevronRight size={16} />,
            }}
          />

          <div className="aem-date-field__time-row">
            <Clock size={14} className="aem-date-field__time-icon" />
            <span className="aem-date-field__time-label">Time</span>
            <input
              ref={timeRef}
              type="time"
              className="aem-date-field__time-input"
              defaultValue={selectedTime}
              onChange={e => handleTimeChange(e.target.value)}
            />
          </div>

          <div className="aem-date-field__popover-footer">
            <button
              type="button"
              className="aem-date-field__confirm-btn"
              onClick={() => setOpen(false)}
              disabled={!value}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Editor status type ─────────────────────────────────────────
type EditorStatus = 'draft' | 'published';

// ── Modal ──────────────────────────────────────────────────────
interface AssignmentEditorModalProps {
  assignment: Assignment | null;
  onClose: () => void;
  onSave?: (
    id: string,
    data: { name: string; openDate: string; dueDate: string; status: EditorStatus },
  ) => void | Promise<void>;
}

const toEditorStatus = (s: AssignmentStatus): EditorStatus =>
  s === 'draft' ? 'draft' : 'published';

const AssignmentEditorModal: React.FC<AssignmentEditorModalProps> = ({
  assignment,
  onClose,
  onSave,
}) => {
  const isOpen = assignment !== null;

  const [name,        setName]        = useState('');
  const [openDate,    setOpenDate]    = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [status,      setStatus]      = useState<EditorStatus>('published');
  const [isClosing,   setIsClosing]   = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Populate fields when a new assignment is opened
  useEffect(() => {
    if (assignment) {
      setName(assignment.title);
      setOpenDate(assignment.openDate ?? '');
      setDueDate(assignment.dueDatetime ?? '');
      setStatus(toEditorStatus(assignment.status));
      setError(null);
    }
  }, [assignment?.id]);

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
    if (!name.trim()) { setError('Assignment name is required'); return; }
    if (!openDate)    { setError('Open date & time is required'); return; }
    if (!dueDate)     { setError('Due date & time is required');  return; }

    const openParsed = parse(openDate, DT_FORMAT, new Date());
    const dueParsed  = parse(dueDate,  DT_FORMAT, new Date());
    if (isValid(openParsed) && isValid(dueParsed) && dueParsed < openParsed) {
      setError('Due date must be on or after open date');
      return;
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

  const openDateObj = openDate ? parse(openDate, DT_FORMAT, new Date()) : undefined;

  if (!isOpen && !isClosing) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`aem-backdrop ${isClosing ? 'aem-backdrop--closing' : ''}`}
        onClick={handleClose}
      />

      {/* Panel */}
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
            <DateTimePickerField
              label="Open Date & Time"
              value={openDate}
              onChange={setOpenDate}
            />

            <DateTimePickerField
              label="Due Date & Time"
              value={dueDate}
              onChange={setDueDate}
              disabledBefore={openDateObj && isValid(openDateObj) ? openDateObj : undefined}
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
          <button
            type="button"
            className="aem__cancel-btn"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="aem__save-btn"
            onClick={handleSave}
            disabled={isSubmitting || !name.trim() || !openDate || !dueDate}
          >
            {isSubmitting ? 'Saving…' : 'Save Assignment'}
          </button>
        </div>
      </div>
    </>
  );
};

export default AssignmentEditorModal;

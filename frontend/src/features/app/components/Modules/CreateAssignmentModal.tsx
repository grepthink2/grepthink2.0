import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parse, isValid } from 'date-fns';
import { X, CalendarDays, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-day-picker/dist/style.css';
import './CreateAssignmentModal.scss';

const ASSIGNMENT_TEMPLATE = 'Team Status Report';

// Internal datetime representation: "yyyy-MM-dd HH:mm" or ''
const DATE_PARSE_FORMAT    = 'yyyy-MM-dd HH:mm';
const DATE_ONLY_FORMAT     = 'yyyy-MM-dd';
const DISPLAY_FORMAT       = "MMM d, yyyy 'at' h:mm a";


// ── DateTimePickerField ────────────────────────────────────────
interface DateTimePickerFieldProps {
  label: string;
  value: string; // "yyyy-MM-dd HH:mm" or ''
  onChange: (val: string) => void;
  disabledBefore?: Date;
}

const DateTimePickerField: React.FC<DateTimePickerFieldProps> = ({
  label,
  value,
  onChange,
  disabledBefore,
}) => {
  const [open, setOpen] = useState(false);
  const [popoverDir, setPopoverDir] = useState<'down' | 'up'>('down');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef   = useRef<HTMLButtonElement>(null);
  const popoverRef   = useRef<HTMLDivElement>(null);
  const timeRef      = useRef<HTMLInputElement>(null);

  // Parse stored value into date + hour parts
  const parsed   = value ? parse(value, DATE_PARSE_FORMAT, new Date()) : undefined;
  const validDate = parsed && isValid(parsed) ? parsed : undefined;

  const selectedDay  = validDate ? new Date(validDate.getFullYear(), validDate.getMonth(), validDate.getDate()) : undefined;
  const selectedHour = validDate
    ? `${String(validDate.getHours()).padStart(2, '0')}:${String(validDate.getMinutes()).padStart(2, '0')}`
    : '08:00';

  const displayText = validDate ? format(validDate, DISPLAY_FORMAT) : 'Select date & time';

  // Decide whether the popover fits below or needs to flip above
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const spaceBelow  = window.innerHeight - triggerRect.bottom;
    const spaceAbove  = triggerRect.top;
    // Popover is roughly 340px tall (calendar ~290px + time row ~50px)
    setPopoverDir(spaceBelow < 360 && spaceAbove > spaceBelow ? 'up' : 'down');
  }, [open]);

  // Close on outside click
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
    const dateStr = format(day, DATE_ONLY_FORMAT);
    onChange(`${dateStr} ${selectedHour}:00`);
    // Keep popover open so user can then pick time
  };

  const handleTimeChange = (time: string) => {
    const dateStr = selectedDay ? format(selectedDay, DATE_ONLY_FORMAT) : format(new Date(), DATE_ONLY_FORMAT);
    onChange(`${dateStr} ${time}`);
  };

  // Keep the uncontrolled time input in sync when value changes externally
  useEffect(() => {
    if (timeRef.current && timeRef.current !== document.activeElement) {
      timeRef.current.value = selectedHour;
    }
  }, [selectedHour]);

  return (
    <div className="date-field" ref={containerRef}>
      <label className="create-assignment-modal__sublabel">{label}</label>

      <button
        ref={triggerRef}
        type="button"
        className={[
          'date-field__trigger',
          open  ? 'date-field__trigger--open'   : '',
          value ? 'date-field__trigger--filled' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => setOpen(v => !v)}
        aria-label={`Pick ${label}`}
      >
        <span className="date-field__text">{displayText}</span>
        <CalendarDays size={16} className="date-field__icon" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={`date-field__popover date-field__popover--${popoverDir}`}
        >
          {/* Calendar */}
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

          {/* Time row */}
          <div className="date-field__time-row">
            <Clock size={14} className="date-field__time-icon" />
            <span className="date-field__time-label">Time</span>
            <input
              ref={timeRef}
              type="time"
              className="date-field__time-input"
              defaultValue={selectedHour}
              onChange={e => handleTimeChange(e.target.value)}
            />
          </div>

          {/* Confirm button */}
          <div className="date-field__popover-footer">
            <button
              type="button"
              className="date-field__confirm-btn"
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

// ── Modal ──────────────────────────────────────────────────────
interface CreateAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateAssignment?: (data: { name: string; openDate: string; dueDate: string }) => void | Promise<void>;
}

const CreateAssignmentModal: React.FC<CreateAssignmentModalProps> = ({
  isOpen,
  onClose,
  onCreateAssignment,
}) => {
  const [assignmentName, setAssignmentName] = useState('');
  const [openDate, setOpenDate] = useState('');
  const [dueDate, setDueDate]   = useState('');
  const [isClosing, setIsClosing]     = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => { setIsClosing(false); onClose(); }, 200);
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

  const handleCreateAssignment = async () => {
    setError(null);
    if (!assignmentName.trim()) { setError('Assignment name is required'); return; }
    if (!openDate)               { setError('Open date & time is required'); return; }
    if (!dueDate)                { setError('Due date & time is required');  return; }

    const openParsed = parse(openDate, DATE_PARSE_FORMAT, new Date());
    const dueParsed  = parse(dueDate,  DATE_PARSE_FORMAT, new Date());
    if (isValid(dueParsed) && isValid(openParsed) && dueParsed < openParsed) {
      setError('Due date must be on or after open date'); return;
    }

    setIsSubmitting(true);
    try {
      await onCreateAssignment?.({ name: assignmentName.trim(), openDate, dueDate });
      setAssignmentName(''); setOpenDate(''); setDueDate('');
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) handleClose();
  };

  if (!isOpen && !isClosing) return null;

  const openDateObj = openDate
    ? parse(openDate, DATE_PARSE_FORMAT, new Date())
    : undefined;

  return (
    <div
      className={`create-assignment-modal-backdrop ${isClosing ? 'closing' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className={`create-assignment-modal ${isClosing ? 'closing' : ''}`}>
        <div className="create-assignment-modal__header">
          <h1 className="create-assignment-modal__title">Create Assignment</h1>
          <button
            className="create-assignment-modal__close-button"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        <div className="create-assignment-modal__content">
          {/* Select Template */}
          <div className="create-assignment-modal__field">
            <h3 className="create-assignment-modal__label">Select Template</h3>
            <div className="create-assignment-modal__template-buttons">
              <button
                type="button"
                className="create-assignment-modal__template-button active"
                disabled
              >
                {ASSIGNMENT_TEMPLATE}
              </button>
            </div>
          </div>

          {/* Assignment Details */}
          <div className="create-assignment-modal__field">
            <h3 className="create-assignment-modal__label">Assignment Details</h3>
            <div className="create-assignment-modal__details">
              <div className="create-assignment-modal__input-group">
                <label className="create-assignment-modal__sublabel">Assignment Name</label>
                <input
                  type="text"
                  className="create-assignment-modal__input"
                  placeholder="e.g., Team Status Report 1"
                  value={assignmentName}
                  onChange={e => setAssignmentName(e.target.value)}
                />
              </div>

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
          </div>

          {error && <div className="create-assignment-modal__error">{error}</div>}

          <div className="create-assignment-modal__actions">
            <button
              type="button"
              className="create-assignment-modal__cancel-button"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="create-assignment-modal__submit-button"
              onClick={handleCreateAssignment}
              disabled={isSubmitting || !assignmentName.trim() || !openDate || !dueDate}
            >
              {isSubmitting ? 'Creating...' : 'Create Assignment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateAssignmentModal;

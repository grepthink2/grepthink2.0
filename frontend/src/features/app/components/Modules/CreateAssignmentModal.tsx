import React, { useState, useEffect, useRef } from 'react';
import { DayPicker } from 'react-day-picker';
import { format, parse, isValid } from 'date-fns';
import { X, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-day-picker/dist/style.css';
import './CreateAssignmentModal.scss';

const ASSIGNMENT_TEMPLATE = 'Team Status Report';
const DATE_FORMAT = 'yyyy-MM-dd';
const DATE_DISPLAY_FORMAT = 'MMM d, yyyy';

interface CreateAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateAssignment?: (data: { name: string; openDate: string; dueDate: string }) => void | Promise<void>;
}

// ── Tiny date-picker popover ───────────────────────────────────
interface DatePickerFieldProps {
  label: string;
  value: string;          // yyyy-MM-dd or ''
  onChange: (val: string) => void;
  disabledBefore?: Date;
}

const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
  disabledBefore,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value
    ? parse(value, DATE_FORMAT, new Date())
    : undefined;
  const displayText =
    selected && isValid(selected)
      ? format(selected, DATE_DISPLAY_FORMAT)
      : 'Select a date';

  const handleSelect = (day: Date | undefined) => {
    onChange(day ? format(day, DATE_FORMAT) : '');
    setOpen(false);
  };

  // Close when clicking outside
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <div className="date-field" ref={containerRef}>
      <label className="create-assignment-modal__sublabel">{label}</label>
      <button
        type="button"
        className={`date-field__trigger${open ? ' date-field__trigger--open' : ''}${value ? ' date-field__trigger--filled' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={`Pick ${label}`}
      >
        <span className="date-field__text">{displayText}</span>
        <CalendarDays size={16} className="date-field__icon" />
      </button>

      {open && (
        <div className="date-field__popover">
          <DayPicker
            mode="single"
            selected={selected && isValid(selected) ? selected : undefined}
            onSelect={handleSelect}
            defaultMonth={selected && isValid(selected) ? selected : new Date()}
            disabled={disabledBefore ? { before: disabledBefore } : undefined}
            components={{
              Chevron: ({ orientation }) =>
                orientation === 'left' ? (
                  <ChevronLeft size={16} />
                ) : (
                  <ChevronRight size={16} />
                ),
            }}
          />
        </div>
      )}
    </div>
  );
};

// ── Modal ──────────────────────────────────────────────────────
const CreateAssignmentModal: React.FC<CreateAssignmentModalProps> = ({
  isOpen,
  onClose,
  onCreateAssignment,
}) => {
  const [assignmentName, setAssignmentName] = useState('');
  const [openDate, setOpenDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isClosing, setIsClosing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
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
    if (!openDate)               { setError('Open date is required');       return; }
    if (!dueDate)                { setError('Due date is required');         return; }
    if (new Date(dueDate) < new Date(openDate)) {
      setError('Due date must be on or after open date');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateAssignment?.({ name: assignmentName.trim(), openDate, dueDate });
      setAssignmentName('');
      setOpenDate('');
      setDueDate('');
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

  const openDateObj = openDate ? new Date(openDate + 'T00:00:00') : undefined;

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
            <label className="create-assignment-modal__label">Select Template</label>
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
            <label className="create-assignment-modal__label">Assignment Details</label>
            <div className="create-assignment-modal__details">
              <div className="create-assignment-modal__input-group">
                <label className="create-assignment-modal__sublabel">Name</label>
                <input
                  type="text"
                  className="create-assignment-modal__input"
                  placeholder="e.g., Team Status Report 1"
                  value={assignmentName}
                  onChange={(e) => setAssignmentName(e.target.value)}
                />
              </div>

              <DatePickerField
                label="Open Date"
                value={openDate}
                onChange={setOpenDate}
              />

              <DatePickerField
                label="Due Date"
                value={dueDate}
                onChange={setDueDate}
                disabledBefore={openDateObj}
              />
            </div>
          </div>

          {error && (
            <div className="create-assignment-modal__error">{error}</div>
          )}

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

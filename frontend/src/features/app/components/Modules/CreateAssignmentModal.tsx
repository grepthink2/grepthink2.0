import React, { useState, useEffect } from 'react';
import { parse, isValid } from 'date-fns';
import { X } from 'lucide-react';
import DatePickerField, { DATETIME_FORMAT } from '@features/app/components/DatePickerField';
import './CreateAssignmentModal.scss';

const ASSIGNMENT_TEMPLATE = 'Team Status Report';

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
  const [isClosing, setIsClosing]       = useState(false);
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
    if (!assignmentName.trim()) { setError('Assignment name is required');    return; }
    if (!openDate)               { setError('Open date & time is required');   return; }
    if (!dueDate)                { setError('Due date & time is required');    return; }

    const openParsed = parse(openDate, DATETIME_FORMAT, new Date());
    const dueParsed  = parse(dueDate,  DATETIME_FORMAT, new Date());
    if (isValid(openParsed) && isValid(dueParsed) && dueParsed < openParsed) {
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

  const openDateObj = openDate ? parse(openDate, DATETIME_FORMAT, new Date()) : undefined;

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

              <DatePickerField
                label="Open Date & Time"
                value={openDate}
                onChange={setOpenDate}
                showTime
                labelClassName="create-assignment-modal__sublabel"
              />

              <DatePickerField
                label="Due Date & Time"
                value={dueDate}
                onChange={setDueDate}
                showTime
                disabledBefore={openDateObj && isValid(openDateObj) ? openDateObj : undefined}
                labelClassName="create-assignment-modal__sublabel"
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

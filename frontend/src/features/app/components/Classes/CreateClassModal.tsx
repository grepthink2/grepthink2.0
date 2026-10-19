import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import { isExternalTasksUrlRefusal, LINK_REFUSED_BY_API, parseExternalTasksUrl } from '@/lib/externalTasksUrl';
import { useInstitutionsWithRetry } from '@/lib/institutions';
import { isPastLatestLastDay } from '@/lib/lastDayOfClasses';
import DatePickerField from '@/features/app/components/Fields/DatePickerField';
import './CreateClassModal.scss';

type Term = 'Fall' | 'Winter' | 'Spring' | 'Summer';

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEFAULT_TSR_COUNT: Record<Term, number> = {
  Fall: 5, Winter: 5, Spring: 5, Summer: 3,
};

const CreateClassModal: React.FC<CreateClassModalProps> = ({ isOpen, onClose }) => {
  const [courseName, setCourseName] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<Term>('Fall');
  const [termStartDate, setTermStartDate] = useState('');
  const [termEndDate, setTermEndDate] = useState('');
  const [tsrCount, setTsrCount] = useState(DEFAULT_TSR_COUNT['Fall']);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  // The class's "Tasks - External" link. Checked once you leave the box (or submit), not mid-word.
  const [tasksUrl, setTasksUrl] = useState('');
  const [tasksUrlChecked, setTasksUrlChecked] = useState(false);
  const [tasksUrlRefused, setTasksUrlRefused] = useState(false); // the API said no
  const tasksUrlInput = useRef<HTMLInputElement>(null);
  const [instructorOnly, setInstructorOnly] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  // undefined: loading · null: couldn't load (retry asks again) · list
  const { institutions, retry: retrySchools } = useInstitutionsWithRetry();
  const { refreshClasses, currentSchool, classes } = useClass();
  const [chosenInstitutionId, setChosenInstitutionId] = useState<string | null>(null);
  const terms: Term[] = ['Fall', 'Winter', 'Spring', 'Summer'];

  // A class belongs to a school: the one picked; else the current school, but only where you
  // already teach a class (a school where you only TA or study is not a safe guess, and a wrong
  // school takes hand-written SQL to fix); else the only school; else none, and you pick.
  const schoolList = institutions ?? [];
  const teachesAtCurrentSchool =
    currentSchool !== null &&
    classes.some((c) => c.my_role === 'instructor' && c.institution?.id === currentSchool.id);
  const defaultInstitutionId =
    (teachesAtCurrentSchool ? schoolList.find((i) => i.id === currentSchool.id)?.id : undefined) ??
    (schoolList.length === 1 ? schoolList[0].id : '');
  const institutionId = chosenInstitutionId ?? defaultInstitutionId;
  const needsInstitution = schoolList.length > 0;
  // Never create a class without its school just because the list has not (or could not) load.
  const schoolsPending = institutions === undefined;
  const schoolsFailed = institutions === null;

  const parsedTasksUrl = parseExternalTasksUrl(tasksUrl);
  const tasksUrlError = tasksUrlRefused
    ? LINK_REFUSED_BY_API
    : tasksUrlChecked && 'error' in parsedTasksUrl
      ? parsedTasksUrl.error
      : null;

  const handleTermChange = (term: Term) => {
    setSelectedTerm(term);
    setTsrCount(DEFAULT_TSR_COUNT[term]);
  };

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200); // Match animation duration
  }, [onClose]);

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
    } else {
      alert('Please upload a CSV file');
      e.target.value = '';
    }
  };

  const handleCreateClass = async () => {
    if (schoolsPending || schoolsFailed) return;
    if (needsInstitution && !institutionId) {
      setError('School is required');
      return;
    }
    if (!courseName.trim()) {
      setError('Course name is required');
      return;
    }
    if (!termStartDate.trim()) {
      setError('First week of term is required');
      return;
    }
    if (!termEndDate.trim()) {
      setError('Last day of classes is required');
      return;
    }
    // Both are yyyy-MM-dd, which sort as dates do. The same day is fine.
    if (termEndDate < termStartDate) {
      setError("The last day of classes can't be before the first week of term");
      return;
    }
    // The API refuses a last day over a year after the first week (lib/lastDayOfClasses); a
    // mistyped year stops here instead of coming back as a bare 422.
    if (isPastLatestLastDay(termStartDate, termEndDate)) {
      setError('The last day of classes must be within a year of the first week of term');
      return;
    }
    if ('error' in parsedTasksUrl) {
      // The box says why; focus takes a screen reader there, and no older error stays up.
      setError(null);
      setTasksUrlChecked(true);
      tasksUrlInput.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const description = `${selectedTerm} term`;
      const result = await api.createClass({
        name: courseName,
        description,
        term: selectedTerm,
        start_date: termStartDate,
        end_date: termEndDate,
        tsr_count: tsrCount,
        institution_id: institutionId || undefined,
        external_tasks_url: parsedTasksUrl.url ?? undefined,
      });

      const createdId = result.class?.id;
      if (!createdId) {
        throw new Error('Class was created but no class id was returned');
      }

      // Refresh roster and select the new class in the sidebar
      await refreshClasses(false, createdId);

      if (csvFile) {
        await api.uploadClassRoster(createdId, csvFile);
      }

      // TODO: Handle instructor-only setting
      if (instructorOnly) {
        console.log('Instructor-only setting not yet implemented');
      }

      // Reset form and close
      setChosenInstitutionId(null);
      setCourseName('');
      setSelectedTerm('Fall');
      setTermStartDate('');
      setTermEndDate('');
      setTsrCount(DEFAULT_TSR_COUNT['Fall']);
      setCsvFile(null);
      setTasksUrl('');
      setTasksUrlChecked(false);
      setTasksUrlRefused(false);
      setInstructorOnly(false);
      handleClose();
      navigate('/app/dashboard');
    } catch (err) {
      console.error('Failed to create class:', err);
      if (isExternalTasksUrlRefusal(err)) {
        setTasksUrlRefused(true);
        tasksUrlInput.current?.focus();
      } else {
        setError(err instanceof Error ? err.message : 'Failed to create class');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div className={`create-class-modal-backdrop ${isClosing ? 'closing' : ''}`} onClick={handleBackdropClick}>
      <div className={`create-class-modal ${isClosing ? 'closing' : ''}`}>
        <div className="create-class-modal__header">
          <h1 className="create-class-modal__title">Add New Class</h1>
          <button
            className="create-class-modal__close-button"
            onClick={handleClose}
            aria-label="Close modal"
          >
            <X size={24} />
          </button>
        </div>

        <div className="create-class-modal__content">
          {/* School: loading, couldn't load (Try again asks again), a choice, or nothing when
              there are no schools yet */}
          {schoolsPending ? (
            <p className="create-class-modal__description">Loading schools…</p>
          ) : schoolsFailed ? (
            <div className="create-class-modal__error create-class-modal__error--with-action" role="alert">
              <span>Couldn&apos;t load the list of schools.</span>
              <button type="button" className="create-class-modal__retry" onClick={retrySchools}>
                Try again
              </button>
            </div>
          ) : needsInstitution ? (
            <div className="create-class-modal__field">
              <label htmlFor="create-class-school" className="create-class-modal__label">
                School
              </label>
              <select
                id="create-class-school"
                className="create-class-modal__input"
                value={institutionId}
                onChange={(e) => setChosenInstitutionId(e.target.value)}
              >
                <option value="" disabled>
                  Select a school
                </option>
                {schoolList.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {/* Course Name Input */}
          <div className="create-class-modal__field">
            <label className="create-class-modal__label">Course Name</label>
            <input
              type="text"
              className="create-class-modal__input"
              placeholder="e.g., CSE 115A"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </div>

          {/* Term Selection */}
          <div className="create-class-modal__field">
            <label className="create-class-modal__label">Term</label>
            <div className="create-class-modal__term-buttons">
              {terms.map((term) => (
                <button
                  key={term}
                  type="button"
                  className={`create-class-modal__term-button ${
                    selectedTerm === term ? 'active' : ''
                  }`}
                  onClick={() => handleTermChange(term)}
                >
                  {term}
                </button>
              ))}
            </div>
          </div>

          {/* Term Start Date */}
          <DatePickerField
            label="First Week of Term"
            value={termStartDate}
            onChange={setTermStartDate}
            labelClassName="create-class-modal__label"
          />

          {/* Term End Date */}
          <div className="create-class-modal__field">
            <DatePickerField
              label="Last Day of Classes"
              value={termEndDate}
              onChange={setTermEndDate}
              labelClassName="create-class-modal__label"
            />
            <p className="create-class-modal__description">Before finals week</p>
          </div>

          {/* TSR Count */}
          <div className="create-class-modal__field">
            <label className="create-class-modal__label">
              Number of TSR Assignments
            </label>
            <p className="create-class-modal__description">
              How many weekly TSR assignments to auto-generate for this class.
            </p>
            <input
              type="number"
              className="create-class-modal__input create-class-modal__input--narrow"
              min={1}
              max={20}
              value={tsrCount}
              onChange={(e) => {
                const val = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                setTsrCount(val);
              }}
            />
          </div>

          {/* Upload Roster */}
          <div className="create-class-modal__field">
            <label className="create-class-modal__label">Upload Roster (Optional)</label>
            <p className="create-class-modal__description">
              Upload a CSV file with student information. You can also add students manually later.
            </p>
            <label className="create-class-modal__upload-area">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="create-class-modal__file-input"
              />
              <div className="create-class-modal__upload-content">
                <Upload size={20} />
                <span>{csvFile ? csvFile.name : 'Choose CSV File'}</span>
              </div>
            </label>
          </div>

          {/* Tasks - External link: the class's task board elsewhere */}
          <div className="create-class-modal__field">
            <label htmlFor="create-class-tasks-url" className="create-class-modal__label">
              Tasks - External Link (Optional)
            </label>
            <p id="create-class-tasks-url-hint" className="create-class-modal__description">
              Your class&apos;s task board elsewhere. Everyone in the class sees it as Tasks&nbsp;-&nbsp;External in
              the sidebar. You can change it later in Class Settings.
            </p>
            <input
              ref={tasksUrlInput}
              id="create-class-tasks-url"
              type="text"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="create-class-modal__input"
              placeholder="https://tasks.example.com/your-class"
              value={tasksUrl}
              onChange={(e) => {
                setTasksUrl(e.target.value);
                setTasksUrlRefused(false);
              }}
              onBlur={() => setTasksUrlChecked(true)}
              aria-invalid={tasksUrlError ? true : undefined}
              aria-describedby={
                tasksUrlError ? 'create-class-tasks-url-hint create-class-tasks-url-error' : 'create-class-tasks-url-hint'
              }
            />
            {tasksUrlError && (
              <p id="create-class-tasks-url-error" className="create-class-modal__field-error">
                {tasksUrlError}
              </p>
            )}
          </div>

          {/* Instructor Only Checkbox */}
          <div className="create-class-modal__field">
            <label className="create-class-modal__checkbox-label">
              <input
                type="checkbox"
                checked={instructorOnly}
                onChange={(e) => setInstructorOnly(e.target.checked)}
                className="create-class-modal__checkbox"
              />
              <span>Only Allow Instructors to Create Projects?</span>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="create-class-modal__error">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="create-class-modal__actions">
            <button
              type="button"
              className="create-class-modal__cancel-button"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className="create-class-modal__submit-button"
              onClick={handleCreateClass}
              disabled={
                isSubmitting ||
                !courseName.trim() ||
                !termStartDate.trim() ||
                !termEndDate.trim() ||
                schoolsPending ||
                schoolsFailed ||
                (needsInstitution && !institutionId)
              }
            >
              {isSubmitting ? 'Creating...' : 'Create Class'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateClassModal;

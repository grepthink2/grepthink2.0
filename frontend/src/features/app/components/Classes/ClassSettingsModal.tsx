import React, { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { parseISO } from 'date-fns';
import { Download, Trash2, X } from 'lucide-react';
import type { Class } from '@/lib/classContext';
import type { ClassLifecycleStatus } from '@/lib/classPreferences';
import { useClass } from '@/lib/classContext';
import { api, type ApiClassSprintSchedule, type ApiSprintFrequency } from '@/lib/api';
import { isExternalTasksUrlRefusal, LINK_REFUSED_BY_API, parseExternalTasksUrl } from '@/lib/externalTasksUrl';
import { DatePickerField } from '@/components/DatePickerField/DatePickerField';
import { ConfirmDialog } from '@/components/ConfirmDialog/ConfirmDialog';
import { Input } from '@/components/Input/Input';
import { Select } from '@/components/Select/Select';
import {
  buildClassExportCsv,
  buildExportFilename,
  downloadCsv,
  rosterStudentToExportRow,
} from '@features/app/utils/exportClassCsv';
import {
  DEFAULT_SPRINT_COUNT,
  DEFAULT_SPRINT_FREQUENCY,
  MAX_SPRINTS,
  MIN_SPRINTS,
  SPRINT_COUNT_ERROR,
  SPRINT_COUNT_HINT,
  SPRINT_FREQUENCY_OPTIONS,
  lastSprintLine,
  parseSprintCount,
  scheduleEnd,
} from '@features/app/utils/sprintSchedule';
import './ClassSettingsModal.scss';

interface ClassSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classItem: Class | null;
}

/** The class's sprint schedule, or null while it has none (the API stores all three or none). */
function savedSprintsOf(classItem: Class): ApiClassSprintSchedule | null {
  const { sprint_count, sprint_frequency, sprints_start_on } = classItem;
  return sprint_count != null && sprint_frequency != null && sprints_start_on != null
    ? { sprint_count, sprint_frequency, sprints_start_on }
    : null;
}

/** What a schedule change did: every team's sprints follow it, and a team made later gets them too. */
function sprintsSavedNotice(teams: number): string {
  if (teams === 0) return 'Sprints saved. New teams get them.';
  return `Sprints updated for ${teams} team${teams === 1 ? '' : 's'}`;
}

/** The last sprint of a schedule and its last day. */
function lastSprintOf({ sprint_count, sprint_frequency, sprints_start_on }: ApiClassSprintSchedule) {
  return { k: sprint_count, endsOn: scheduleEnd(sprints_start_on, sprint_count, sprint_frequency) };
}

const ClassSettingsModal: React.FC<ClassSettingsModalProps> = ({ isOpen, onClose, classItem }) => {
  const {
    getClassStatus,
    setClassLifecycleStatus,
    setClassExternalTasksUrl,
    setClassEndDate,
    setClassSprints,
    hideClassFromUI,
  } = useClass();
  const [isClosing, setIsClosing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lifecycleStatus, setLifecycleStatus] = useState<ClassLifecycleStatus>('active');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  // The class's "Tasks - External" link: what the box holds, and what was last saved (this
  // dialog's class row is the one it opened with, so it would still show the old link).
  const [tasksUrl, setTasksUrl] = useState('');
  const [savedTasksUrl, setSavedTasksUrl] = useState<string | null>(null);
  const [tasksUrlChecked, setTasksUrlChecked] = useState(false);
  const [isSavingTasksUrl, setIsSavingTasksUrl] = useState(false);
  const [tasksUrlSaveError, setTasksUrlSaveError] = useState<string | null>(null);
  const [tasksUrlNotice, setTasksUrlNotice] = useState<string | null>(null);
  const tasksUrlInput = useRef<HTMLInputElement>(null);
  // The class's last day of classes: the day the picker holds, and the day last saved (the row
  // this dialog opened with still has the old one).
  const [endDate, setEndDate] = useState('');
  const [savedEndDate, setSavedEndDate] = useState('');
  const [isSavingEndDate, setIsSavingEndDate] = useState(false);
  const [endDateSaveError, setEndDateSaveError] = useState<string | null>(null);
  const [endDateNotice, setEndDateNotice] = useState<string | null>(null);
  // The class's sprint schedule: what the fields hold (the count as typed, so the box can be emptied
  // and typed again), and the schedule last saved, null while the class has none. A class with none
  // offers "Set up sprints", which shows the fields.
  const [sprintCountText, setSprintCountText] = useState('');
  const [sprintFrequency, setSprintFrequency] = useState<ApiSprintFrequency>(DEFAULT_SPRINT_FREQUENCY);
  const [sprintsStartOn, setSprintsStartOn] = useState('');
  const [savedSprints, setSavedSprints] = useState<ApiClassSprintSchedule | null>(null);
  const [settingUpSprints, setSettingUpSprints] = useState(false);
  const [isSavingSprints, setIsSavingSprints] = useState(false);
  const [sprintsSaveError, setSprintsSaveError] = useState<string | null>(null);
  const [sprintsNotice, setSprintsNotice] = useState<string | null>(null);
  const sprintCountInput = useRef<HTMLInputElement>(null);

  // Each open (or a switch to another class while open) starts from that
  // class's saved status, link, last day and sprints with no errors showing. Adjusted during render
  // when the open class changes, instead of in an effect afterwards.
  const openClass = isOpen ? classItem : null;
  const [prevOpenClass, setPrevOpenClass] = useState<Class | null>(null);
  if (openClass !== prevOpenClass) {
    setPrevOpenClass(openClass);
    if (openClass) {
      setLifecycleStatus(getClassStatus(openClass));
      setExportError(null);
      setStatusError(null);
      setTasksUrl(openClass.external_tasks_url ?? '');
      setSavedTasksUrl(openClass.external_tasks_url ?? null);
      setTasksUrlChecked(false);
      setIsSavingTasksUrl(false);
      setTasksUrlSaveError(null);
      setTasksUrlNotice(null);
      setEndDate(openClass.end_date ?? '');
      setSavedEndDate(openClass.end_date ?? '');
      setIsSavingEndDate(false);
      setEndDateSaveError(null);
      setEndDateNotice(null);
      // A class with no schedule starts from the one Create Class offers, its first sprint in the
      // first week of term.
      const sprints = savedSprintsOf(openClass);
      setSavedSprints(sprints);
      setSprintCountText(String(sprints?.sprint_count ?? DEFAULT_SPRINT_COUNT));
      setSprintFrequency(sprints?.sprint_frequency ?? DEFAULT_SPRINT_FREQUENCY);
      setSprintsStartOn(sprints?.sprints_start_on ?? openClass.start_date ?? '');
      setSettingUpSprints(false);
      setIsSavingSprints(false);
      setSprintsSaveError(null);
      setSprintsNotice(null);
    }
  }

  // The class the dialog shows now, for a save that answers after it moved on to another.
  const openClassId = useRef<string | null>(null);
  useEffect(() => {
    openClassId.current = openClass?.id ?? null;
  }, [openClass]);

  const parsedTasksUrl = parseExternalTasksUrl(tasksUrl);
  const tasksUrlProblem = tasksUrlChecked && 'error' in parsedTasksUrl ? parsedTasksUrl.error : null;
  // A box that can't be saved counts as changed, so Save is there to say why.
  const tasksUrlChanged = 'error' in parsedTasksUrl || parsedTasksUrl.url !== savedTasksUrl;
  // The API takes a day and never clears it, so Save waits for a day other than the saved one.
  const endDateChanged = endDate !== '' && endDate !== savedEndDate;

  const sprintCount = parseSprintCount(sprintCountText);
  // An empty box holds Save, as an empty day does; only a count that can't be used is an error.
  const sprintCountError = sprintCountText !== '' && sprintCount === null ? SPRINT_COUNT_ERROR : undefined;
  // The schedule the fields hold, once there is a count and a day to count from.
  const sprintsShown: ApiClassSprintSchedule | null =
    sprintCount !== null && sprintsStartOn !== ''
      ? { sprint_count: sprintCount, sprint_frequency: sprintFrequency, sprints_start_on: sprintsStartOn }
      : null;
  const lastSprint = sprintsShown && lastSprintOf(sprintsShown);
  // The API checks a schedule against the last day saved, not one picked and not saved yet. Holds Save.
  const sprintsPastLastDay = lastSprint !== null && savedEndDate !== '' && lastSprint.endsOn > savedEndDate;
  const sprintsChanged =
    sprintsShown !== null &&
    (savedSprints === null ||
      sprintsShown.sprint_count !== savedSprints.sprint_count ||
      sprintsShown.sprint_frequency !== savedSprints.sprint_frequency ||
      sprintsShown.sprints_start_on !== savedSprints.sprints_start_on);
  // Shown beside the last day of classes: the API refuses a day before it, so the schedule goes first.
  const savedLastSprint = savedSprints && lastSprintOf(savedSprints);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !showDeleteConfirm) {
        handleClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, showDeleteConfirm, handleClose]);

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

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !showDeleteConfirm) {
      handleClose();
    }
  };

  const handleStatusChange = async (status: ClassLifecycleStatus) => {
    if (!classItem || isUpdatingStatus) return;
    const previous = lifecycleStatus;
    setLifecycleStatus(status);
    setStatusError(null);
    setIsUpdatingStatus(true);
    try {
      await setClassLifecycleStatus(classItem.id, status);
    } catch (err) {
      setLifecycleStatus(previous);
      setStatusError(err instanceof Error ? err.message : 'Failed to update class status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const saveTasksUrl = async (next: string | null) => {
    if (!classItem || isSavingTasksUrl) return;
    const classId = classItem.id;
    setIsSavingTasksUrl(true);
    setTasksUrlSaveError(null);
    setTasksUrlNotice(null);
    try {
      await setClassExternalTasksUrl(classId, next);
      if (openClassId.current !== classId) return; // the dialog shows another class now
      setSavedTasksUrl(next);
      setTasksUrl(next ?? '');
      setTasksUrlChecked(false);
      setTasksUrlNotice(next ? 'Link saved. It is in the class sidebar now.' : 'Link removed from the class sidebar.');
      // Remove goes away and Save turns disabled: keep the keyboard in the box, not on the page.
      tasksUrlInput.current?.focus();
    } catch (err) {
      if (openClassId.current !== classId) return;
      setTasksUrlSaveError(
        isExternalTasksUrlRefusal(err)
          ? LINK_REFUSED_BY_API
          : err instanceof Error
            ? err.message
            : 'Failed to update the tasks link',
      );
    } finally {
      if (openClassId.current === classId) setIsSavingTasksUrl(false);
    }
  };

  const handleSaveTasksUrl = () => {
    if ('error' in parsedTasksUrl) {
      // The box says why; focus takes a screen reader there.
      setTasksUrlChecked(true);
      tasksUrlInput.current?.focus();
      return;
    }
    void saveTasksUrl(parsedTasksUrl.url);
  };

  const saveEndDate = async () => {
    if (!classItem || isSavingEndDate) return;
    const classId = classItem.id;
    const day = endDate;
    setIsSavingEndDate(true);
    setEndDateSaveError(null);
    setEndDateNotice(null);
    try {
      await setClassEndDate(classId, day);
      if (openClassId.current !== classId) return; // the dialog shows another class now
      setSavedEndDate(day);
      setEndDate(day);
      setEndDateNotice('Last day of classes saved.');
    } catch (err) {
      if (openClassId.current !== classId) return;
      setEndDateSaveError(err instanceof Error ? err.message : 'Failed to update the last day of classes');
    } finally {
      if (openClassId.current === classId) setIsSavingEndDate(false);
    }
  };

  /** Clear what the last save said once the schedule changes. */
  const editSprints = () => {
    setSprintsSaveError(null);
    setSprintsNotice(null);
  };

  const saveSprints = async () => {
    if (!classItem || isSavingSprints || sprintsShown === null) return;
    const classId = classItem.id;
    const schedule = sprintsShown;
    setIsSavingSprints(true);
    setSprintsSaveError(null);
    setSprintsNotice(null);
    try {
      const { teams } = await setClassSprints(classId, schedule);
      if (openClassId.current !== classId) return; // the dialog shows another class now
      // Show the saved schedule with the fields enabled again, then put the keyboard back in the
      // count box: Save turned disabled under it.
      flushSync(() => {
        setSavedSprints(schedule);
        setSprintCountText(String(schedule.sprint_count));
        setSprintFrequency(schedule.sprint_frequency);
        setSprintsStartOn(schedule.sprints_start_on);
        setSprintsNotice(sprintsSavedNotice(teams));
        setIsSavingSprints(false);
      });
      sprintCountInput.current?.focus();
    } catch (err) {
      if (openClassId.current !== classId) return;
      // The API's refusals (a team's story in a sprint the count drops, dates that don't fit) say what to do.
      setSprintsSaveError(err instanceof Error ? err.message : 'Failed to update the sprint schedule');
    } finally {
      if (openClassId.current === classId) setIsSavingSprints(false);
    }
  };

  const handleDeleteConfirm = () => {
    if (!classItem) return;
    hideClassFromUI(classItem.id);
    setShowDeleteConfirm(false);
    handleClose();
  };

  const handleExport = async () => {
    if (!classItem || isExporting) return;
    setIsExporting(true);
    setExportError(null);
    try {
      const { students } = await api.getClassRoster(classItem.id);
      const rows = students.map(rosterStudentToExportRow);
      const csv = buildClassExportCsv(rows);
      downloadCsv(buildExportFilename(classItem), csv);
    } catch (err) {
      console.error('Failed to export class data:', err);
      setExportError(err instanceof Error ? err.message : 'Failed to export class data');
    } finally {
      setIsExporting(false);
    }
  };

  if ((!isOpen && !isClosing) || !classItem) return null;

  return (
    <>
      <div
        className={`class-settings-modal-backdrop ${isClosing ? 'closing' : ''}`}
        onClick={handleBackdropClick}
      >
        <div
          className={`class-settings-modal ${isClosing ? 'closing' : ''}`}
          role="dialog"
          aria-labelledby="class-settings-title"
          aria-modal="true"
        >
          <div className="class-settings-modal__header">
            <h1 id="class-settings-title" className="class-settings-modal__title">
              Class Settings
            </h1>
            <button
              type="button"
              className="class-settings-modal__close-button"
              onClick={handleClose}
              aria-label="Close modal"
            >
              <X size={24} />
            </button>
          </div>

          <p className="class-settings-modal__class-name">{classItem.name}</p>

          <div className="class-settings-modal__content">
            <section className="class-settings-modal__section">
              <div className="class-settings-modal__section-heading">
                <h2 className="class-settings-modal__label">Class status</h2>
                <p className="class-settings-modal__hint">
                  Completed classes stay on My Classes but are removed from the sidebar class
                  selector.
                </p>
              </div>
              <div
                className="class-settings-modal__status-toggle"
                role="group"
                aria-label="Class status"
              >
                <button
                  type="button"
                  className={`class-settings-modal__status-pill${
                    lifecycleStatus === 'active' ? ' active' : ''
                  }`}
                  aria-pressed={lifecycleStatus === 'active'}
                  disabled={isUpdatingStatus}
                  onClick={() => void handleStatusChange('active')}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={`class-settings-modal__status-pill${
                    lifecycleStatus === 'complete' ? ' active' : ''
                  }`}
                  aria-pressed={lifecycleStatus === 'complete'}
                  disabled={isUpdatingStatus}
                  onClick={() => void handleStatusChange('complete')}
                >
                  Completed
                </button>
              </div>
              {statusError && (
                <p className="class-settings-modal__export-error" role="alert">
                  {statusError}
                </p>
              )}
            </section>

            <section className="class-settings-modal__section">
              <DatePickerField
                label="Last Day of Classes"
                value={endDate}
                onChange={(next) => {
                  setEndDate(next);
                  setEndDateSaveError(null);
                  setEndDateNotice(null);
                }}
                // A day picked while the save is in flight would be written over by the day being saved.
                disabled={isSavingEndDate}
              />
              <p className="class-settings-modal__hint">Before finals week</p>
              {/* The saved schedule's last sprint: a last day before it is refused, so the schedule goes first */}
              {savedLastSprint && (
                <p className="class-settings-modal__hint">{lastSprintLine(savedLastSprint.k, savedLastSprint.endsOn)}</p>
              )}
              <div className="class-settings-modal__link-actions">
                <button
                  type="button"
                  className="class-settings-modal__export-button class-settings-modal__save-button"
                  onClick={() => void saveEndDate()}
                  disabled={!endDateChanged || isSavingEndDate}
                >
                  {isSavingEndDate ? 'Saving…' : 'Save last day'}
                </button>
                {/* Always on the page, so a screen reader announces the text when it appears */}
                <span className="class-settings-modal__link-notice" role="status">
                  {endDateNotice}
                </span>
              </div>
              {endDateSaveError && (
                <p className="class-settings-modal__export-error" role="alert">
                  {endDateSaveError}
                </p>
              )}
            </section>

            <section className="class-settings-modal__section">
              <h2 id="class-settings-sprints-title" className="class-settings-modal__label">
                Sprints
              </h2>
              {savedSprints === null && !settingUpSprints ? (
                <button
                  type="button"
                  className="class-settings-modal__export-button"
                  onClick={() => setSettingUpSprints(true)}
                >
                  Set up sprints
                </button>
              ) : (
                <>
                  {/* How many, how often and from when: every team's sprints follow them */}
                  <div
                    className="class-settings-modal__sprint-fields"
                    role="group"
                    aria-labelledby="class-settings-sprints-title"
                  >
                    <Input
                      ref={sprintCountInput}
                      label="How many"
                      type="number"
                      inputMode="numeric"
                      min={MIN_SPRINTS}
                      max={MAX_SPRINTS}
                      step={1}
                      value={sprintCountText}
                      onChange={(e) => {
                        setSprintCountText(e.target.value);
                        editSprints();
                      }}
                      helperText={SPRINT_COUNT_HINT}
                      error={sprintCountError}
                      // Set up sprints went away as it was pressed: the keyboard goes on to the first field.
                      autoFocus={settingUpSprints}
                      // A change made while the save is in flight would be written over by the schedule being saved.
                      disabled={isSavingSprints}
                    />
                    <Select
                      label="Every"
                      value={sprintFrequency}
                      onChange={(e) => {
                        setSprintFrequency(e.target.value as ApiSprintFrequency);
                        editSprints();
                      }}
                      options={SPRINT_FREQUENCY_OPTIONS}
                      disabled={isSavingSprints}
                    />
                    <DatePickerField
                      label="First sprint starts"
                      value={sprintsStartOn}
                      onChange={(next) => {
                        setSprintsStartOn(next);
                        editSprints();
                      }}
                      disabledBefore={classItem.start_date ? parseISO(classItem.start_date) : undefined}
                      disabled={isSavingSprints}
                    />
                  </div>
                  {/* Always on the page, so a screen reader announces the line as it changes */}
                  <p
                    className={`class-settings-modal__sprint-preview${
                      sprintsPastLastDay ? ' class-settings-modal__sprint-preview--past-end' : ''
                    }`}
                    role="status"
                  >
                    {lastSprint && lastSprintLine(lastSprint.k, lastSprint.endsOn, sprintsPastLastDay)}
                  </p>
                  <div className="class-settings-modal__link-actions">
                    <button
                      type="button"
                      className="class-settings-modal__export-button class-settings-modal__save-button"
                      onClick={() => void saveSprints()}
                      disabled={!sprintsChanged || sprintsPastLastDay || isSavingSprints}
                    >
                      {isSavingSprints ? 'Saving…' : "Save and update every team's sprints"}
                    </button>
                    {/* Always on the page, so a screen reader announces the text when it appears */}
                    <span className="class-settings-modal__link-notice" role="status">
                      {sprintsNotice}
                    </span>
                  </div>
                  {sprintsSaveError && (
                    <p className="class-settings-modal__export-error" role="alert">
                      {sprintsSaveError}
                    </p>
                  )}
                </>
              )}
            </section>

            <section className="class-settings-modal__section">
              <div className="class-settings-modal__section-heading">
                <h2 className="class-settings-modal__label">
                  <label htmlFor="class-settings-tasks-url">Tasks - External link</label>
                </h2>
                <p id="class-settings-tasks-url-hint" className="class-settings-modal__hint">
                  Your class&apos;s task board elsewhere. Everyone in the class sees it as Tasks&nbsp;-&nbsp;External in
                  the sidebar. Leave it empty to hide it.
                </p>
              </div>
              <input
                ref={tasksUrlInput}
                id="class-settings-tasks-url"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="class-settings-modal__input"
                placeholder="https://tasks.example.com/your-class"
                value={tasksUrl}
                onChange={(e) => {
                  setTasksUrl(e.target.value);
                  setTasksUrlSaveError(null);
                  setTasksUrlNotice(null);
                }}
                onBlur={() => setTasksUrlChecked(true)}
                aria-invalid={tasksUrlProblem ? true : undefined}
                aria-describedby={
                  tasksUrlProblem
                    ? 'class-settings-tasks-url-hint class-settings-tasks-url-error'
                    : 'class-settings-tasks-url-hint'
                }
              />
              {tasksUrlProblem && (
                <p id="class-settings-tasks-url-error" className="class-settings-modal__export-error">
                  {tasksUrlProblem}
                </p>
              )}
              <div className="class-settings-modal__link-actions">
                <button
                  type="button"
                  className="class-settings-modal__export-button class-settings-modal__save-button"
                  onClick={handleSaveTasksUrl}
                  disabled={!tasksUrlChanged || isSavingTasksUrl}
                >
                  {isSavingTasksUrl ? 'Saving…' : 'Save link'}
                </button>
                {savedTasksUrl && (
                  <button
                    type="button"
                    className="class-settings-modal__text-button"
                    onClick={() => void saveTasksUrl(null)}
                    disabled={isSavingTasksUrl}
                  >
                    Remove link
                  </button>
                )}
                {/* Always on the page, so a screen reader announces the text when it appears */}
                <span className="class-settings-modal__link-notice" role="status">
                  {tasksUrlNotice}
                </span>
              </div>
              {tasksUrlSaveError && (
                <p className="class-settings-modal__export-error" role="alert">
                  {tasksUrlSaveError}
                </p>
              )}
            </section>

            <section className="class-settings-modal__section">
              <h2 className="class-settings-modal__label">Export</h2>
              <button
                type="button"
                className="class-settings-modal__export-button"
                onClick={() => void handleExport()}
                disabled={isExporting}
              >
                <Download size={18} aria-hidden />
                {isExporting ? 'Exporting…' : 'Export class data'}
              </button>
              <p className="class-settings-modal__hint class-settings-modal__hint--inline">
                Download a CSV with student names, roster email, GrepThink email, and project.
              </p>
              {exportError && (
                <p className="class-settings-modal__export-error" role="alert">
                  {exportError}
                </p>
              )}
            </section>

            <section className="class-settings-modal__section class-settings-modal__section--danger">
              <h2 className="class-settings-modal__label">Remove class</h2>
              <p className="class-settings-modal__hint">
                Removes this class from your view only. The class and its data remain in GrepThink.
              </p>
              <button
                type="button"
                className="class-settings-modal__delete-button"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={18} aria-hidden />
                Delete class
              </button>
            </section>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        destructive
        title="Delete class?"
        message={`Remove "${classItem.name}" from your classes list? This only hides it for you and does not delete the class from the database.`}
        confirmLabel="Remove from my view"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
};

export default ClassSettingsModal;

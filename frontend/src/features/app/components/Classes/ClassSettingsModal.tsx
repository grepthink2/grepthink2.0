import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, Trash2, X } from 'lucide-react';
import type { Class } from '@/lib/classContext';
import type { ClassLifecycleStatus } from '@/lib/classPreferences';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import { isExternalTasksUrlRefusal, LINK_REFUSED_BY_API, parseExternalTasksUrl } from '@/lib/externalTasksUrl';
import ConfirmModal from '@features/app/components/Overlays/ConfirmModal';
import {
  buildClassExportCsv,
  buildExportFilename,
  downloadCsv,
  rosterStudentToExportRow,
} from '@features/app/utils/exportClassCsv';
import './ClassSettingsModal.scss';

interface ClassSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classItem: Class | null;
}

const ClassSettingsModal: React.FC<ClassSettingsModalProps> = ({ isOpen, onClose, classItem }) => {
  const { getClassStatus, setClassLifecycleStatus, setClassExternalTasksUrl, hideClassFromUI } = useClass();
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

  // Each open (or a switch to another class while open) starts from that
  // class's saved status and link with no errors showing. Adjusted during render when
  // the open class changes, instead of in an effect afterwards.
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

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete class?"
        message={`Remove "${classItem.name}" from your classes list? This only hides it for you and does not delete the class from the database.`}
        confirmText="Remove from my view"
        cancelText="Cancel"
      />
    </>
  );
};

export default ClassSettingsModal;

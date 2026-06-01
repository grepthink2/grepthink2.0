import React, { useState, useEffect, useCallback } from 'react';
import { Download, Trash2, X } from 'lucide-react';
import type { Class } from '@/lib/classContext';
import type { ClassLifecycleStatus } from '@/lib/classPreferences';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
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
  const { getClassStatus, setClassLifecycleStatus, hideClassFromUI } = useClass();
  const [isClosing, setIsClosing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lifecycleStatus, setLifecycleStatus] = useState<ClassLifecycleStatus>('active');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  useEffect(() => {
    if (isOpen && classItem) {
      setLifecycleStatus(getClassStatus(classItem));
      setExportError(null);
    }
  }, [isOpen, classItem, getClassStatus]);

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

  const handleStatusChange = (status: ClassLifecycleStatus) => {
    if (!classItem) return;
    setLifecycleStatus(status);
    setClassLifecycleStatus(classItem.id, status);
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
                  onClick={() => handleStatusChange('active')}
                >
                  Active
                </button>
                <button
                  type="button"
                  className={`class-settings-modal__status-pill${
                    lifecycleStatus === 'completed' ? ' active' : ''
                  }`}
                  aria-pressed={lifecycleStatus === 'completed'}
                  onClick={() => handleStatusChange('completed')}
                >
                  Completed
                </button>
              </div>
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

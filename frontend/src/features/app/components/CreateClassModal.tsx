import React, { useState, useEffect } from 'react';
import { Upload, X } from 'lucide-react';
import './CreateClassModal.scss';

type Term = 'Fall' | 'Winter' | 'Spring' | 'Summer';

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CreateClassModal: React.FC<CreateClassModalProps> = ({ isOpen, onClose }) => {
  const [courseName, setCourseName] = useState('');
  const [selectedTerm, setSelectedTerm] = useState<Term>('Fall');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [instructorOnly, setInstructorOnly] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const terms: Term[] = ['Fall', 'Winter', 'Spring', 'Summer'];

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200); // Match animation duration
  };

  // Close modal on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

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

  const handleCreateClass = () => {
    // TODO: Implement class creation logic
    console.log({
      courseName,
      selectedTerm,
      csvFile,
      instructorOnly,
    });
    handleClose();
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
                  onClick={() => setSelectedTerm(term)}
                >
                  {term}
                </button>
              ))}
            </div>
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

          {/* Action Buttons */}
          <div className="create-class-modal__actions">
            <button
              type="button"
              className="create-class-modal__cancel-button"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="create-class-modal__submit-button"
              onClick={handleCreateClass}
            >
              Create Class
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateClassModal;

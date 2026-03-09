import React from 'react';

interface ProjectHeaderProps {
  projectTitle: string;
  onTitleChange: (value: string) => void;
  titleError: string | null;
  isPreview: boolean;
  onTogglePreview: () => void;
}

const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  projectTitle,
  onTitleChange,
  titleError,
  isPreview,
  onTogglePreview,
}) => {
  return (
    <div className="create-project__header">
      <div className="create-project__header-left">
        {isPreview ? (
          <div className="create-project__preview-header">
            <div className="create-project__preview-badge">Live Preview</div>
            <p className="create-project__preview-text">
              You are viewing this project as others will see it
            </p>
          </div>
        ) : (
          <>
            <input
              type="text"
              className="create-project__title-input"
              value={projectTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Project Title"
            />
            {titleError && (
              <div className="create-project__field-error" role="alert">
                {titleError}
              </div>
            )}
          </>
        )}
      </div>
      <div className="create-project__preview-toggle">
        <label className="create-project__preview-label">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Preview
        </label>
        <button
          className={`create-project__toggle-button ${isPreview ? 'active' : ''}`}
          onClick={onTogglePreview}
          aria-label="Toggle preview"
        >
          <span className="create-project__toggle-slider"></span>
        </button>
      </div>
    </div>
  );
};

export default ProjectHeader;

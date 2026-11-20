import React from 'react';

interface ProjectFooterProps {
  submitting: boolean;
  isDisabled: boolean;
  onCreateProject: () => void;
}

const ProjectFooter: React.FC<ProjectFooterProps> = ({
  submitting,
  isDisabled,
  onCreateProject,
}) => {
  return (
    <div className="create-project__footer">
      <div className="create-project__footer-right">
        <button
          className="create-project__button create-project__button--primary"
          onClick={onCreateProject}
          disabled={isDisabled}
        >
          {submitting ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>
  );
};

export default ProjectFooter;

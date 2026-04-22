import React from 'react';

interface SubmittedConfirmationProps {
  assignmentName: string;
  onEdit: () => void;
  onBackToAssignments: () => void;
}

const SubmittedConfirmation: React.FC<SubmittedConfirmationProps> = ({
  assignmentName,
  onEdit,
  onBackToAssignments,
}) => (
  <div className="interest-form__submitted">
    <div className="interest-form__submitted-icon">✓</div>
    <h3 className="interest-form__submitted-title">Interest Form Submitted</h3>
    <p className="interest-form__submitted-sub">
      Your preferences for <strong>{assignmentName}</strong> have been recorded.
      The instructor will use these to form project teams.
    </p>
    <div className="interest-form__submitted-actions">
      <button
        type="button"
        className="tsrs-btn tsrs-btn--secondary"
        onClick={onEdit}
      >
        Edit submission
      </button>
      <button
        type="button"
        className="tsrs-btn tsrs-btn--primary"
        onClick={onBackToAssignments}
      >
        Back to assignments
      </button>
    </div>
  </div>
);

export default SubmittedConfirmation;

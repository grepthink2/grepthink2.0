import React from 'react';
import './StudentAssignmentsTable.scss';

export type StudentAssignmentStatus = 'not_started' | 'in_progress' | 'submitted';

export type StudentAssignmentAction = 'start' | 'edit_submission' | 'closed';

/** Discriminator for which form component to render on the detail page. */
export type AssignmentType = 'tsrs' | 'interest_form';

export interface StudentAssignment {
  id: string;
  name: string;
  /** Display string for the table, e.g. "Jan 12, 2026" */
  dueDate: string;
  projectName: string;
  status: StudentAssignmentStatus;
  action: StudentAssignmentAction;
  /** Type of assignment — determines which form component is shown. */
  type: AssignmentType;
  /** Project the student is submitting this assignment for. */
  projectId?: string;
}

interface StudentAssignmentsTableProps {
  assignments: StudentAssignment[];
  onStart?: (assignment: StudentAssignment) => void;
  onEditSubmission?: (assignment: StudentAssignment) => void;
}

const statusLabel: Record<StudentAssignmentStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  submitted: 'Submitted',
};

const statusClassName: Record<StudentAssignmentStatus, string> = {
  not_started: 'not-started',
  in_progress: 'in-progress',
  submitted: 'submitted',
};

const actionLabel: Record<StudentAssignmentAction, string> = {
  start: 'Start',
  edit_submission: 'Edit submission',
  closed: 'Closed',
};

const StudentAssignmentsTable: React.FC<StudentAssignmentsTableProps> = ({
  assignments,
  onStart,
  onEditSubmission,
}) => {
  const handleActionClick = (assignment: StudentAssignment) => {
    if (assignment.action === 'start') {
      onStart?.(assignment);
    } else if (assignment.action === 'edit_submission') {
      onEditSubmission?.(assignment);
    }
  };

  return (
    <div className="student-assignments">
      <div className="student-assignments__header">
        <h2 className="student-assignments__title">Assignments</h2>
        <span className="student-assignments__count-badge">{assignments.length}</span>
      </div>

      <div className="student-assignments__table-card">
        <div className="student-assignments__table-wrapper">
          <table className="student-assignments__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Due Date</th>
                <th>Project Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => (
                <tr key={`${assignment.id}-${assignment.projectId ?? ''}`}>
                  <td className="student-assignments__td-name">{assignment.name}</td>
                  <td className="student-assignments__td-date">{assignment.dueDate}</td>
                  <td className="student-assignments__td-project">{assignment.projectName}</td>
                  <td className="student-assignments__td-status">
                    <span
                      className={`status-badge status-badge--${statusClassName[assignment.status]}`}
                    >
                      {statusLabel[assignment.status]}
                    </span>
                  </td>
                  <td className="student-assignments__td-actions">
                    <button
                      type="button"
                      className={`student-assignments__action-btn student-assignments__action-btn--${assignment.action}`}
                      onClick={() => handleActionClick(assignment)}
                      disabled={assignment.action === 'closed'}
                    >
                      {actionLabel[assignment.action]}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default StudentAssignmentsTable;

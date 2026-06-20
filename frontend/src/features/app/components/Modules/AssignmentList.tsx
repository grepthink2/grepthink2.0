import React, { useState } from 'react';
import { SquarePen } from 'lucide-react';
import './AssignmentList.scss';

export type AssignmentStatus = 'active' | 'draft' | 'closed';

export interface Assignment {
  id: string;
  title: string;
  /** Display string for the table, e.g. "Jan 12, 2026" */
  dueDate: string;
  /** Datetime for the editor — "yyyy-MM-dd HH:mm" */
  openDate: string;
  /** Datetime for the editor — "yyyy-MM-dd HH:mm" */
  dueDatetime: string;
  submitted: number;
  total: number;
  status: AssignmentStatus;
  assignmentType?: string;
  /** True when at least one TSR response exists (instructor Modules list). */
  hasTsrResponses?: boolean;
  /** True when at least one feedback response exists (instructor Modules list). */
  hasFeedbackResponses?: boolean;
}

interface AssignmentListProps {
  assignments: Assignment[];
  onEdit?: (assignment: Assignment) => void;
  onViewTsr?: (assignment: Assignment) => void;
  onViewFeedback?: (assignment: Assignment) => void;
}

const statusLabel: Record<AssignmentStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  closed: 'Closed',
};

const AssignmentList: React.FC<AssignmentListProps> = ({ assignments, onEdit, onViewTsr, onViewFeedback }) => {
  const [_editingId, setEditingId] = useState<string | null>(null);

  const handleEdit = (assignment: Assignment) => {
    setEditingId(assignment.id);
    onEdit?.(assignment);
  };

  return (
    <div className="assignment-list">
      <div className="assignment-list__header">
        <h2 className="assignment-list__title">Assignment Count</h2>
        <span className="assignment-list__count-badge">{assignments.length}</span>
      </div>

      <div className="assignment-list__table-card">
        <div className="assignment-list__table-wrapper">
          <table className="assignment-list__table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Due Date</th>
                <th>Submissions</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment) => {
                const pct = assignment.total > 0
                  ? Math.round((assignment.submitted / assignment.total) * 100)
                  : 0;
                const isTsr = assignment.assignmentType !== 'interest_form' && assignment.assignmentType !== 'feedback';
                const canViewTsr =
                  isTsr && onViewTsr && Boolean(assignment.hasTsrResponses);
                const isFeedback = assignment.assignmentType === 'feedback';
                const canViewFeedback =
                  isFeedback && onViewFeedback && Boolean(assignment.hasFeedbackResponses);
                const handleTitleClick = () => {
                  if (canViewTsr) onViewTsr?.(assignment);
                  else if (canViewFeedback) onViewFeedback?.(assignment);
                };
                return (
                  <tr
                    key={assignment.id}
                    className={
                      canViewTsr || canViewFeedback ? 'assignment-list__row--clickable' : ''
                    }
                    onClick={canViewTsr || canViewFeedback ? handleTitleClick : undefined}
                  >
                    <td className="assignment-list__td-title">
                      {canViewTsr ? (
                        <button
                          type="button"
                          className="assignment-list__title-link"
                          onClick={(e) => { e.stopPropagation(); onViewTsr?.(assignment); }}
                        >
                          {assignment.title}
                        </button>
                      ) : canViewFeedback ? (
                        <button
                          type="button"
                          className="assignment-list__title-link"
                          onClick={(e) => { e.stopPropagation(); onViewFeedback?.(assignment); }}
                        >
                          {assignment.title}
                        </button>
                      ) : (
                        assignment.title
                      )}
                    </td>
                    <td className="assignment-list__td-date">{assignment.dueDate}</td>
                    <td className="assignment-list__td-submissions">
                      {assignment.total > 0 ? (
                        <>
                          <span className="submissions__label">
                            {assignment.submitted}/{assignment.total}{' '}
                            <span className="submissions__pct">({pct}%)</span>
                          </span>
                          <div className="submissions__bar">
                            <div
                              className="submissions__bar-fill"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <span className="submissions__label">—</span>
                      )}
                    </td>
                    <td className="assignment-list__td-status">
                      <span className={`status-badge status-badge--${assignment.status}`}>
                        {statusLabel[assignment.status]}
                      </span>
                    </td>
                    <td className="assignment-list__td-actions">
                      <button
                        className="edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(assignment);
                        }}
                      >
                        <SquarePen size={13} />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AssignmentList;

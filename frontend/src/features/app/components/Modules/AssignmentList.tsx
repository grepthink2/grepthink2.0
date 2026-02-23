import React, { useState } from 'react';
import { SquarePen } from 'lucide-react';
import './AssignmentList.scss';

export type AssignmentStatus = 'active' | 'draft' | 'closed';

export interface Assignment {
  id: string;
  title: string;
  dueDate: string;
  submitted: number;
  total: number;
  status: AssignmentStatus;
}

interface AssignmentListProps {
  assignments: Assignment[];
  onEdit?: (assignmentId: string) => void;
}

const statusLabel: Record<AssignmentStatus, string> = {
  active: 'Active',
  draft: 'Draft',
  closed: 'Closed',
};

const AssignmentList: React.FC<AssignmentListProps> = ({ assignments, onEdit }) => {
  const [_editingId, setEditingId] = useState<string | null>(null);

  const handleEdit = (id: string) => {
    setEditingId(id);
    onEdit?.(id);
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
                const pct = Math.round((assignment.submitted / assignment.total) * 100);
                return (
                  <tr key={assignment.id}>
                    <td className="assignment-list__td-title">{assignment.title}</td>
                    <td className="assignment-list__td-date">{assignment.dueDate}</td>
                    <td className="assignment-list__td-submissions">
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
                    </td>
                    <td className="assignment-list__td-status">
                      <span className={`status-badge status-badge--${assignment.status}`}>
                        {statusLabel[assignment.status]}
                      </span>
                    </td>
                    <td className="assignment-list__td-actions">
                      <button
                        className="edit-btn"
                        onClick={() => handleEdit(assignment.id)}
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

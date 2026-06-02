import React from 'react';
import { Users, CheckCircle, FolderOpen } from 'lucide-react';
import type { AssignSummary } from './assignTypes';
import './AssignSummaryBar.scss';

interface AssignSummaryBarProps {
  summary: AssignSummary;
}

const AssignSummaryBar: React.FC<AssignSummaryBarProps> = ({ summary }) => {
  const {
    studentsUnassigned,
    availableSeats,
    projectsRemaining,
    projectsTotal,
  } = summary;

  return (
    <div className="assign-summary">
      <div className="assign-summary__tile">
        <Users size={22} className="assign-summary__icon" />
        <div className="assign-summary__text">
          <div className="assign-summary__label">Students Unassigned</div>
          <div className="assign-summary__value">{studentsUnassigned}</div>
        </div>
      </div>

      <div className="assign-summary__divider" />

      <div className="assign-summary__tile">
        <CheckCircle size={22} className="assign-summary__icon" />
        <div className="assign-summary__text">
          <div className="assign-summary__label">Available Seats</div>
          <div className="assign-summary__value">{availableSeats}</div>
        </div>
      </div>

      <div className="assign-summary__divider" />

      <div className="assign-summary__tile">
        <FolderOpen size={22} className="assign-summary__icon" />
        <div className="assign-summary__text">
          <div className="assign-summary__label">Remaining Projects</div>
          <div className="assign-summary__value">
            {projectsRemaining}
            <span className="assign-summary__value-muted">
              /{projectsTotal}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignSummaryBar;

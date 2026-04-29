import React from 'react';
import { Star, Plus, Minus } from 'lucide-react';
import type { AssignProject } from './assignTypes';
import './FocusedProjectCard.scss';

interface FocusedProjectCardProps {
  project: AssignProject;
  onAddSeat: () => void;
  onRemoveSeat: () => void;
}

const FocusedProjectCard: React.FC<FocusedProjectCardProps> = ({
  project,
  onAddSeat,
  onRemoveSeat,
}) => {
  const canRemove = project.totalSeats > project.seatsTaken;

  return (
    <div className="focused-project">
      <div className="focused-project__main">
        <div className="focused-project__title-block">
          <h3 className="focused-project__name">{project.name}</h3>
          <div className="focused-project__sponsor">Sponsor: {project.sponsor}</div>
        </div>

        <div className="focused-project__meta">
          <div className="focused-project__popularity">
            <span className="focused-project__popularity-value">
              <Star size={16} className="focused-project__star" />
              {project.popularity.toFixed(1)}
            </span>
            <span className="focused-project__popularity-label">Popularity</span>
          </div>

          <div className="focused-project__seats">
            <span className="focused-project__seats-value">
              {project.seatsTaken} / {project.totalSeats}
            </span>
            <span className="focused-project__seats-label">Team Members</span>
          </div>
        </div>
      </div>

      <div className="focused-project__seat-controls">
        <button
          type="button"
          className="focused-project__seat-btn"
          onClick={onRemoveSeat}
          disabled={!canRemove}
          aria-label="Remove a seat"
        >
          <Minus size={14} />
          Remove Seat
        </button>
        <button
          type="button"
          className="focused-project__seat-btn focused-project__seat-btn--primary"
          onClick={onAddSeat}
          aria-label="Add a seat"
        >
          <Plus size={14} />
          Add Seat
        </button>
      </div>
    </div>
  );
};

export default FocusedProjectCard;

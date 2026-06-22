import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './WeekNavigator.scss';

interface WeekNavigatorProps {
  weekNumber: number;
  totalWeeks: number;
  weekOf?: string | null;
  onPrev: () => void;
  onNext: () => void;
}

function formatWeekOf(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const WeekNavigator: React.FC<WeekNavigatorProps> = ({ weekNumber, totalWeeks, weekOf, onPrev, onNext }) => {
  const label = formatWeekOf(weekOf);
  return (
    <div className="week-navigator">
      <button
        type="button"
        className="week-navigator__btn"
        onClick={onPrev}
        disabled={weekNumber <= 1}
        aria-label="Previous week"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="week-navigator__label">
        Week {weekNumber}
        {label && <span className="week-navigator__sub"> · {label}</span>}
      </span>
      <button
        type="button"
        className="week-navigator__btn"
        onClick={onNext}
        disabled={weekNumber >= totalWeeks}
        aria-label="Next week"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
};

export default WeekNavigator;

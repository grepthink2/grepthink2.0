import React from 'react';
import { List, Network } from 'lucide-react';
import type { StudentViewMode } from './assignTypes';
import './ViewToggle.scss';

interface ViewToggleProps {
  value: StudentViewMode;
  onChange: (mode: StudentViewMode) => void;
}

const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => {
  return (
    <div className="view-toggle" role="group" aria-label="Student view mode">
      <button
        type="button"
        className={`view-toggle__btn${value === 'list' ? ' view-toggle__btn--active' : ''}`}
        aria-pressed={value === 'list'}
        aria-label="List view"
        onClick={() => onChange('list')}
      >
        <List size={18} />
      </button>
      <button
        type="button"
        className={`view-toggle__btn${value === 'graph' ? ' view-toggle__btn--active' : ''}`}
        aria-pressed={value === 'graph'}
        aria-label="Graph view"
        onClick={() => onChange('graph')}
      >
        <Network size={18} />
      </button>
    </div>
  );
};

export default ViewToggle;

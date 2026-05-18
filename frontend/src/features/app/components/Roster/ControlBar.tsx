import React, { useCallback, useRef, useState } from 'react';
import { Search, Mail, Upload, ChevronDown } from 'lucide-react';
import type { FilterOption } from './rosterTypes';
import { FILTER_LABELS } from './rosterTypes';
import { useClickOutside } from '@features/app/components/Interest/useClickOutside';
import './ControlBar.scss';

interface ControlBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  filter: FilterOption;
  onFilterChange: (v: FilterOption) => void;
  /** Instructor-only — omit for student view */
  notRegisteredCount?: number;
  onInviteAll?: () => void;
  onUploadRoster?: () => void;
}

const ControlBar: React.FC<ControlBarProps> = ({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  notRegisteredCount,
  onInviteAll,
  onUploadRoster,
}) => {
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const closeFilter = useCallback(() => setFilterOpen(false), []);
  useClickOutside(filterRef, closeFilter);

  const handleSelect = (key: FilterOption) => {
    onFilterChange(key);
    setFilterOpen(false);
  };

  return (
    <div className="roster-control-bar">
      <div className="roster-control-bar__search">
        <Search size={15} className="roster-control-bar__search-icon" />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="roster-control-bar__search-input"
        />
      </div>

      {/* Custom filter dropdown */}
      <div className="roster-control-bar__filter-wrap" ref={filterRef}>
        <button
          type="button"
          className={`roster-control-bar__filter-trigger${filterOpen ? ' roster-control-bar__filter-trigger--open' : ''}`}
          onClick={() => setFilterOpen((o) => !o)}
        >
          <span>{FILTER_LABELS[filter]}</span>
          <ChevronDown
            size={14}
            className={`roster-control-bar__filter-chevron${filterOpen ? ' roster-control-bar__filter-chevron--open' : ''}`}
          />
        </button>

        {filterOpen && (
          <div className="roster-control-bar__filter-list">
            {(Object.keys(FILTER_LABELS) as FilterOption[]).map((key) => (
              <button
                key={key}
                type="button"
                className={`roster-control-bar__filter-item${key === filter ? ' roster-control-bar__filter-item--active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(key)}
              >
                {key === filter && (
                  <span className="roster-control-bar__filter-check">✓</span>
                )}
                {FILTER_LABELS[key]}
              </button>
            ))}
          </div>
        )}
      </div>

      {onInviteAll && (
        <button
          className="roster-control-bar__btn roster-control-bar__btn--invite"
          onClick={onInviteAll}
        >
          <Mail size={14} />
          Invite All Not Registered
          {notRegisteredCount !== undefined && (
            <span className="roster-control-bar__badge">{notRegisteredCount}</span>
          )}
        </button>
      )}

      {onUploadRoster && (
        <button
          className="roster-control-bar__btn roster-control-bar__btn--upload"
          onClick={onUploadRoster}
        >
          <Upload size={14} />
          Upload Roster
        </button>
      )}
    </div>
  );
};

export default ControlBar;

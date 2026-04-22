import React, { useCallback, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { MOCK_PROJECTS, type ProjectChoice } from './interestTypes';
import { useClickOutside } from './useClickOutside';

interface RankedProjectSlotProps {
  rank: number;
  choice: ProjectChoice | null;
  /** Project ids already used by sibling slots (to prevent duplicates). */
  takenIds: Set<string>;
  onSelect: (choice: ProjectChoice) => void;
  onClear: () => void;
  onReasoningChange: (reasoning: string) => void;
}

const RankedProjectSlot: React.FC<RankedProjectSlotProps> = ({
  rank,
  choice,
  takenIds,
  onSelect,
  onClear,
  onReasoningChange,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const wrapperRef        = useRef<HTMLDivElement>(null);

  const handleOutside = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  useClickOutside(wrapperRef, handleOutside);

  const available = MOCK_PROJECTS.filter(
    (p) => !takenIds.has(p.id) && p.name.toLowerCase().includes(query.toLowerCase()),
  );

  const isFilled = choice !== null;

  return (
    <div className={`if-slot${isFilled ? ' if-slot--filled' : ''}`}>
      <div className="if-slot__rank">#{rank}</div>

      <div className="if-slot__card" ref={wrapperRef}>
        <div className="if-slot__picker">
          {isFilled ? (
            <div className="if-slot__selected">
              <span className="if-slot__selected-name">{choice!.projectName}</span>
              <button
                type="button"
                className="if-slot__clear"
                onClick={() => { onClear(); setQuery(''); setOpen(false); }}
                aria-label={`Clear project for rank ${rank}`}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div
              className={`if-slot__trigger${open ? ' if-slot__trigger--open' : ''}`}
              onClick={() => setOpen(true)}
            >
              <input
                type="text"
                className="if-slot__search"
                placeholder="Select a project…"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
              />
              <ChevronDown size={15} className={`if-chevron${open ? ' if-chevron--open' : ''}`} />
            </div>
          )}

          {open && !isFilled && (
            <div className="if-dropdown-list">
              {available.length === 0 ? (
                <div className="if-dropdown-list__empty">
                  {query ? 'No projects match your search' : 'No projects available'}
                </div>
              ) : (
                available.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="if-dropdown-list__item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelect({ projectId: p.id, projectName: p.name, reasoning: '' });
                      setQuery('');
                      setOpen(false);
                    }}
                  >
                    <span className="if-dropdown-list__name">{p.name}</span>
                    {p.description && (
                      <span className="if-dropdown-list__sub">{p.description}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="if-slot__body">
          <textarea
            className="if-textarea if-slot__reasoning"
            rows={2}
            placeholder="Why are you interested in this project? What skills or ideas would you bring?"
            value={choice?.reasoning ?? ''}
            disabled={!isFilled}
            onChange={(e) => onReasoningChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

export default RankedProjectSlot;

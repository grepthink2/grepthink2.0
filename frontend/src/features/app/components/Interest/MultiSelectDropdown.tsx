import React, { useCallback, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { MockStudent } from './interestTypes';
import { useClickOutside } from './useClickOutside';

interface MultiSelectDropdownProps {
  placeholder: string;
  options: MockStudent[];
  selected: MockStudent[];
  maxItems?: number;
  onSelect: (student: MockStudent) => void;
  onRemove: (studentId: string) => void;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  placeholder,
  options,
  selected,
  maxItems,
  onSelect,
  onRemove,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen]   = useState(false);
  const wrapperRef        = useRef<HTMLDivElement>(null);

  const handleOutside = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);
  useClickOutside(wrapperRef, handleOutside);

  const selectedIds = new Set(selected.map((s) => s.id));
  const filtered    = options
    .filter((s) => !selectedIds.has(s.id))
    .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));
  const isAtMax = maxItems !== undefined && selected.length >= maxItems;

  return (
    <div className="if-multiselect">
      {selected.length > 0 && (
        <div className="if-pills">
          {selected.map((s) => (
            <span key={s.id} className="if-pill">
              {s.name}
              <button
                type="button"
                className="if-pill__remove"
                onClick={() => onRemove(s.id)}
                aria-label={`Remove ${s.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="if-dropdown-wrap" ref={wrapperRef}>
        <div
          className={`if-slot__trigger${open ? ' if-slot__trigger--open' : ''}${isAtMax ? ' if-slot__trigger--disabled' : ''}`}
          onClick={() => { if (!isAtMax) setOpen(true); }}
        >
          <input
            type="text"
            className="if-slot__search"
            placeholder={isAtMax ? `Max ${maxItems} selected` : placeholder}
            value={query}
            disabled={isAtMax}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => { if (!isAtMax) setOpen(true); }}
          />
          <ChevronDown size={15} className={`if-chevron${open ? ' if-chevron--open' : ''}`} />
        </div>

        {open && !isAtMax && (
          <div className="if-dropdown-list">
            {filtered.length === 0 ? (
              <div className="if-dropdown-list__empty">No students found</div>
            ) : (
              filtered.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="if-dropdown-list__item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(s);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  <span className="if-dropdown-list__name">{s.name}</span>
                  {s.email && <span className="if-dropdown-list__sub">{s.email}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiSelectDropdown;

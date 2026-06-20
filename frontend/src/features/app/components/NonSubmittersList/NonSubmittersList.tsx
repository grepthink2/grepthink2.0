import React, { useState, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import './NonSubmittersList.scss';

interface NonSubmittersListProps {
  nonSubmitters: { id: string; name: string }[];
  label?: string;
}

const NonSubmittersList: React.FC<NonSubmittersListProps> = ({
  nonSubmitters,
  label = 'Missing Submissions',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nonSubmitters;
    return nonSubmitters.filter((s) => s.name.toLowerCase().includes(q));
  }, [nonSubmitters, query]);

  if (nonSubmitters.length === 0) return null;

  const toggle = () => setOpen((o) => !o);

  return (
    <div className="ns-list">
      <div
        className="ns-list__header"
        onClick={toggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle(); }}
      >
        <span className="ns-list__title">
          {label}
          <span className="ns-list__badge">{nonSubmitters.length}</span>
        </span>
        <ChevronDown
          size={15}
          className={`ns-list__chevron${open ? ' ns-list__chevron--open' : ''}`}
        />
      </div>

      {open && (
        <div className="ns-list__body">
          <div className="ns-list__search-row">
            <Search size={14} className="ns-list__search-icon" />
            <input
              type="text"
              className="ns-list__search"
              placeholder="Search by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <p className="ns-list__empty">No results.</p>
          ) : (
            <ul className="ns-list__names">
              {filtered.map((s) => (
                <li key={s.id} className="ns-list__name-item">{s.name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default NonSubmittersList;

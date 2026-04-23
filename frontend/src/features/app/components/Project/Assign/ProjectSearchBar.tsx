import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Star } from 'lucide-react';
import type { AssignProject } from './assignTypes';
import { useClickOutside } from '@features/app/components/Interest/useClickOutside';
import './ProjectSearchBar.scss';

interface ProjectSearchBarProps {
  projects: AssignProject[];
  focusedProjectId: string | null;
  onSelect: (project: AssignProject) => void;
}

const ProjectSearchBar: React.FC<ProjectSearchBarProps> = ({
  projects,
  focusedProjectId,
  onSelect,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  useClickOutside(containerRef, () => setOpen(false));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sponsor.toLowerCase().includes(q),
    );
  }, [projects, query]);

  // Clamp highlight within bounds whenever results change.
  useEffect(() => {
    setHighlightIdx((prev) => {
      if (results.length === 0) return 0;
      return Math.min(prev, results.length - 1);
    });
  }, [results]);

  // Auto-scroll the highlighted item into view.
  useEffect(() => {
    if (!open) return;
    const el = dropdownRef.current?.querySelector<HTMLButtonElement>(
      `[data-idx="${highlightIdx}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  const handleSelect = (project: AssignProject) => {
    onSelect(project);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlightIdx((i) => (results.length === 0 ? 0 : (i + 1) % results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlightIdx((i) =>
        results.length === 0 ? 0 : (i - 1 + results.length) % results.length,
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = results[highlightIdx];
      if (selected) handleSelect(selected);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div
      className={`project-search${open ? ' project-search--open' : ''}`}
      ref={containerRef}
    >
      <div className="project-search__input-row">
        <Search size={16} className="project-search__icon" />
        <input
          type="text"
          className="project-search__input"
          placeholder="Search projects..."
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightIdx(0);
          }}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={open}
        />
      </div>

      {open && (
        <ul
          className="project-search__dropdown"
          role="listbox"
          ref={dropdownRef}
        >
          {results.length === 0 ? (
            <li className="project-search__empty">No projects found.</li>
          ) : (
            results.map((project, idx) => {
              const active = project.id === focusedProjectId;
              const highlighted = idx === highlightIdx;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    data-idx={idx}
                    className={`project-search__item${
                      active ? ' project-search__item--active' : ''
                    }${highlighted ? ' project-search__item--highlighted' : ''}`}
                    onClick={() => handleSelect(project)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                  >
                    <div className="project-search__item-info">
                      <div className="project-search__item-name">{project.name}</div>
                      <div className="project-search__item-sponsor">
                        {project.sponsor}
                      </div>
                    </div>
                    <div className="project-search__item-meta">
                      <span className="project-search__rating">
                        <Star size={14} className="project-search__star" />
                        {project.popularity.toFixed(1)}
                      </span>
                      <span className="project-search__seats">
                        {project.seatsTaken}/{project.totalSeats}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
};

export default ProjectSearchBar;

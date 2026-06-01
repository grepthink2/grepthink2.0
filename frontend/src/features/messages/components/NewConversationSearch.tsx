import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuPencilLine, LuSearch, LuX } from 'react-icons/lu';
import { api } from '@/lib/api';
import type { ApiClass, ApiStudent } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { emailToDisplayName } from '@features/app/utils/memberUtils';
import { InitialsAvatar } from './InitialsAvatar';

interface Classmate {
  id: string;
  email: string;
  displayName: string;
  classNames: string[];
}

/**
 * Button + dropdown in the messages left-pane header that lets the user
 * find and start a conversation with any classmate (across all enrolled classes).
 *
 * Clicking the pencil icon opens a search panel. Results are drawn from
 * GET /api/classes and GET /api/classes/{id}/students for each class.
 * The current user is excluded. Clicking a result navigates to
 * /app/messages/compose?to={userId}&name={displayName}.
 */
export const NewConversationSearch: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all classmates once when the panel opens.
  const loadClassmates = useCallback(async () => {
    if (classmates.length > 0) return; // already loaded
    setLoading(true);
    setError(null);
    try {
      const { classes } = await api.getClasses();
      const byId = new Map<string, Classmate>();

      await Promise.all(
        classes.map(async (cls: ApiClass) => {
          try {
            const { students } = await api.getClassStudents(cls.id);
            for (const s of students) {
              const uid = s.user_id ?? s.id;
              if (!uid || uid === user?.id) continue;
              if (byId.has(uid)) {
                byId.get(uid)!.classNames.push(cls.name);
              } else {
                const first = s.first_name?.trim() ?? '';
                const last = s.last_name?.trim() ?? '';
                const full = `${first} ${last}`.trim();
                byId.set(uid, {
                  id: uid,
                  email: s.email,
                  displayName: full || emailToDisplayName(s.email),
                  classNames: [cls.name],
                });
              }
            }
          } catch {
            // skip classes we can't fetch students for
          }
        }),
      );

      setClassmates(
        [...byId.values()].sort((a, b) =>
          a.displayName.localeCompare(b.displayName),
        ),
      );
    } catch {
      setError('Could not load classmates.');
    } finally {
      setLoading(false);
    }
  }, [classmates.length, user?.id]);

  const handleOpen = () => {
    setOpen(true);
    loadClassmates();
  };

  const handleClose = () => {
    setOpen(false);
    setQuery('');
  };

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) handleClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Focus input when panel opens.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = query.trim()
    ? classmates.filter(
        (c) =>
          c.displayName.toLowerCase().includes(query.toLowerCase()) ||
          c.email.toLowerCase().includes(query.toLowerCase()),
      )
    : classmates;

  const handleSelect = (cm: Classmate) => {
    handleClose();
    navigate(
      `/app/messages/compose?to=${cm.id}&name=${encodeURIComponent(cm.displayName)}`,
    );
  };

  return (
    <div className="new-conv-search" ref={containerRef}>
      <button
        type="button"
        className="new-conv-search__trigger"
        aria-label="New conversation"
        onClick={open ? handleClose : handleOpen}
      >
        {open ? <LuX size={18} /> : <LuPencilLine size={18} />}
      </button>

      {open && (
        <div className="new-conv-search__panel">
          <div className="new-conv-search__input-row">
            <LuSearch size={15} className="new-conv-search__icon" />
            <input
              ref={inputRef}
              type="text"
              className="new-conv-search__input"
              placeholder="Search classmates…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') handleClose();
                if (e.key === 'Enter' && filtered.length === 1)
                  handleSelect(filtered[0]);
              }}
            />
          </div>

          <ul className="new-conv-search__results">
            {loading && (
              <li className="new-conv-search__status">Loading classmates…</li>
            )}
            {error && !loading && (
              <li className="new-conv-search__status new-conv-search__status--error">
                {error}
              </li>
            )}
            {!loading && !error && filtered.length === 0 && (
              <li className="new-conv-search__status">
                {query ? 'No results.' : 'No classmates found.'}
              </li>
            )}
            {filtered.map((cm) => (
              <li key={cm.id}>
                <button
                  type="button"
                  className="new-conv-search__result"
                  onClick={() => handleSelect(cm)}
                >
                  <InitialsAvatar email={cm.email} name={cm.displayName} size={36} />
                  <div className="new-conv-search__result-text">
                    <span className="new-conv-search__result-name">
                      {cm.displayName}
                    </span>
                    <span className="new-conv-search__result-classes">
                      {cm.classNames.join(', ')}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

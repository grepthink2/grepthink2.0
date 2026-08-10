import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuPencilLine, LuSearch, LuX } from 'react-icons/lu';
import { api } from '@/lib/api';
import type { ApiContact } from '@/lib/api';
import { emailToDisplayName } from '@features/app/utils/memberUtils';
import { InitialsAvatar } from './InitialsAvatar';
import { Skeleton } from '@/components/Skeleton/Skeleton';

/**
 * Button + dropdown in the messages left-pane header that lets the user
 * find and start a conversation with anyone they're allowed to message
 * (peers across their enrolled/owned classes).
 *
 * Clicking the pencil icon opens a search panel. Results come from a
 * debounced GET /api/messages/contacts?q= call — the backend already
 * excludes the caller and enforces messaging eligibility (e.g.
 * instructor<->instructor pairs), so no client-side filtering is needed.
 * Clicking a result navigates to /app/messages/compose?to={userId}&name={displayName}.
 */
export const NewConversationSearch: React.FC = () => {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<ApiContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced server-side search. Only runs while the panel is open, and
  // re-fetches whenever the query changes (including the empty-query fetch
  // that shows the full contact list right after opening). `loading` is
  // flipped on synchronously by the triggering event handlers below
  // (handleOpen / handleQueryChange), not here — setting state directly in
  // an effect body causes an extra cascading render.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await api.getContacts(query);
        if (!cancelled) {
          setContacts(res.contacts);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query]);

  const handleOpen = () => {
    setOpen(true);
    setLoading(true);
  };

  const handleClose = () => {
    setOpen(false);
    setQuery('');
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setLoading(true);
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

  const contactName = (c: ApiContact) => c.name || emailToDisplayName(c.email ?? undefined);

  const handleSelect = (c: ApiContact) => {
    handleClose();
    navigate(
      `/app/messages/compose?to=${c.id}&name=${encodeURIComponent(contactName(c))}`,
      { viewTransition: true },
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
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') handleClose();
                if (e.key === 'Enter' && !loading && contacts.length === 1)
                  handleSelect(contacts[0]);
              }}
            />
          </div>

          <ul className="new-conv-search__results" aria-busy={loading}>
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px' }}>
                  <Skeleton circle height={36} />
                  <Skeleton width="55%" height={13} />
                </li>
              ))}
            {error && !loading && (
              <li className="new-conv-search__status new-conv-search__status--error">
                {error}
              </li>
            )}
            {!loading && !error && contacts.length === 0 && (
              <li className="new-conv-search__status">
                {query ? 'No results.' : 'No classmates found.'}
              </li>
            )}
            {!loading &&
              contacts.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="new-conv-search__result"
                    onClick={() => handleSelect(c)}
                  >
                    <InitialsAvatar
                      email={c.email}
                      name={contactName(c)}
                      imageUrl={c.image_url}
                      size={36}
                    />
                    <div className="new-conv-search__result-text">
                      <span className="new-conv-search__result-name">
                        {contactName(c)}
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

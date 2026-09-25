import React from 'react';

const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/**
 * @-mention autocomplete listbox, anchored to a composer textarea.
 * Async-first: pass `members` for client-side filtering or `onSearch`
 * for Supabase-style lookups (debounced 250ms). Focus stays in the
 * textarea — the host wires aria-activedescendant to the active row.
 * First consumer: scrum comments; repo-wide (messages adopt it later).
 */
export function MentionListbox({
  open = true,
  query = '',
  members,
  onSearch,
  onSelect,
  position = 'below',
  activeIndex = 0,
  id = 'gt-mentionbox',
  stateOverride,
  className = '',
  ...rest
}) {
  const [results, setResults] = React.useState([]);
  const [status, setStatus] = React.useState('idle');
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (stateOverride) return;
    const q = query.trim();
    if (!q) { setStatus('idle'); setResults([]); return; }
    if (members) {
      const r = members.filter((m) => `${m.name} ${m.secondary || ''}`.toLowerCase().includes(q.toLowerCase()));
      setResults(r);
      setStatus(r.length ? 'results' : 'empty');
      return;
    }
    if (!onSearch) { setStatus('idle'); return; }
    setStatus('loading');
    let live = true;
    const t = window.setTimeout(() => {
      onSearch(q)
        .then((r) => { if (!live) return; setResults(r || []); setStatus(r && r.length ? 'results' : 'empty'); })
        .catch(() => { if (live) setStatus('error'); });
    }, 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [query, members, onSearch, stateOverride, tick]);

  if (!open) return null;
  const state = stateOverride || status;

  return (
    <div
      id={id}
      role="listbox"
      aria-label="Mention a teammate"
      className={['gt-mentionbox', `gt-mentionbox--${position}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {state === 'idle' && <div className="gt-mentionbox__hint">Type to mention a teammate</div>}
      {state === 'loading' && (
        <div className="gt-mentionbox__hint"><span className="gt-mentionbox__spinner" aria-hidden="true" />Searching…</div>
      )}
      {state === 'empty' && <div className="gt-mentionbox__hint">No matches for “{query.trim()}”</div>}
      {state === 'error' && (
        <div className="gt-mentionbox__hint gt-mentionbox__hint--error">
          Couldn’t search members.
          <button type="button" className="gt-mentionbox__retry" onClick={() => setTick((n) => n + 1)}>Retry</button>
        </div>
      )}
      {state === 'results' && results.map((m, i) => (
        <div
          key={m.id != null ? m.id : m.name}
          id={`${id}-opt-${i}`}
          role="option"
          aria-selected={i === activeIndex}
          className={['gt-mentionbox__row', i === activeIndex ? 'gt-mentionbox__row--active' : ''].filter(Boolean).join(' ')}
          onMouseDown={(e) => { e.preventDefault(); onSelect && onSelect(m); }}
        >
          <span className="gt-mentionbox__avatar" aria-hidden="true">{initials(m.name)}</span>
          <span className="gt-mentionbox__id">
            <span className="gt-mentionbox__name">{m.name}</span>
            {m.secondary && <span className="gt-mentionbox__sub">{m.secondary}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

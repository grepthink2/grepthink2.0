import React from 'react';
import { ResultRow, ResultGroup } from './ResultRow.jsx';
import { SearchPagination } from './SearchPagination.jsx';
import { Kbd, modKey } from './Kbd.jsx';
import { rankResults, countByType, paginate, routeFor, SEARCH_ENTITIES, useDebounced } from './SearchModel.jsx';
import { useDialog, dialogPortal } from '../feedback/Modal.jsx';
import { FilterChipGroup } from '../navigation/FilterChip.jsx';

const SearchGlyph = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>;

/** Global ⌘K / Ctrl+K listener. Ignores the shortcut while typing in another field only when `ignoreInputs` is true. */
export function usePaletteHotkey(onToggle, { enabled = true } = {}) {
  React.useEffect(() => {
    if (!enabled) return undefined;
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); onToggle(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onToggle, enabled]);
}

/**
 * Global search dialog. Controlled: `open` + `onClose`. Results come from
 * `items` (ranked client-side) or `onSearch(query, scope)` (async, debounced
 * 250ms; previous results stay visible while a new query loads).
 * Joins the dialog stack (useDialog, like Modal and Drawer): Esc and the scrim close only the
 * topmost layer, so over a Modal the first Esc closes the palette and focus returns into the
 * dialog, and the second Esc closes the dialog. Tab stays inside; portaled to <body>.
 * Scopes are a single-choice FilterChipGroup (radio group). `inline` renders in place (galleries).
 */
export function CommandPalette({
  open = false, onClose, onOpen, hotkey = true,
  items = [], onSearch, recent = [], onSelect, role = 'student',
  pageSize = 8, placeholder = 'Search people, teams, projects, tasks…', scopes,
  initialQuery = '', inline = false, className = '',
}) {
  const baseId = React.useId();
  const inputRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const [query, setQuery] = React.useState(initialQuery);
  const [scope, setScope] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const [active, setActive] = React.useState(0);
  const [remote, setRemote] = React.useState({ status: 'idle', items: [] });
  const debounced = useDebounced(query, onSearch ? 250 : 0);
  const { mounted, closing, onScrimDown } = useDialog({ open, onClose, sheetRef: panelRef, initialFocusRef: inputRef, exitMs: 150, inPlace: inline });

  const requestClose = React.useCallback(() => { if (onClose) onClose(); }, [onClose]);

  usePaletteHotkey(React.useCallback(() => (open ? requestClose() : onOpen && onOpen()), [open, requestClose, onOpen]), { enabled: hotkey && !inline });

  // reset per open
  React.useEffect(() => { if (open) { setQuery(initialQuery); setScope('all'); setPage(1); setActive(0); } }, [open, initialQuery]);

  // async source
  React.useEffect(() => {
    if (!onSearch || !open) return undefined;
    if (!debounced.trim()) { setRemote({ status: 'idle', items: [] }); return undefined; }
    let alive = true;
    setRemote((r) => ({ status: r.items.length ? 'refetching' : 'loading', items: r.items }));
    onSearch(debounced, scope).then(
      (res) => alive && setRemote({ status: 'ready', items: res || [] }),
      () => alive && setRemote({ status: 'error', items: [] }),
    );
    return () => { alive = false; };
  }, [debounced, scope, onSearch, open, remote.retryTick]);

  const q = query.trim();
  const source = onSearch ? remote.items : items;
  const unscoped = React.useMemo(() => (q ? rankResults(source, q, { scope: 'all', recentIds: recent.map((r) => r.id) }) : []), [source, q, recent]);
  const counts = React.useMemo(() => countByType(unscoped), [unscoped]);
  const ranked = React.useMemo(() => (scope === 'all' ? unscoped : unscoped.filter((i) => i.type === scope)), [unscoped, scope]);
  const idle = !q;
  const list = idle ? recent : ranked;
  const pageData = React.useMemo(() => paginate(list, page, pageSize), [list, page, pageSize]);
  const optionRows = pageData.rows.filter((r) => r.kind === 'item');

  React.useEffect(() => { setPage(1); setActive(0); }, [q, scope]);
  React.useEffect(() => { setActive(0); }, [page]);

  const status = onSearch ? (idle ? 'idle' : remote.status) : (idle ? 'idle' : 'ready');
  const showSkeleton = status === 'loading';
  const showError = status === 'error';
  const showEmpty = !idle && status !== 'loading' && status !== 'error' && ranked.length === 0;

  const select = (item) => {
    const route = routeFor(item, { role });
    onSelect && onSelect(item, route);
    requestClose();
  };

  // Esc is the dialog stack's (useDialog): it closes only the topmost layer.
  const onKeyDown = (e) => {
    const n = optionRows.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (n) setActive((i) => (i + 1) % n); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (n) setActive((i) => (i - 1 + n) % n); return; }
    if (e.key === 'Home' && n) { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End' && n) { e.preventDefault(); setActive(n - 1); return; }
    if (e.key === 'PageDown' && pageData.page < pageData.pages) { e.preventDefault(); setPage((p) => p + 1); return; }
    if (e.key === 'PageUp' && pageData.page > 1) { e.preventDefault(); setPage((p) => p - 1); return; }
    if (e.key === 'ArrowRight' && e.target.selectionStart === query.length && pageData.page < pageData.pages) { e.preventDefault(); setPage((p) => p + 1); return; }
    if (e.key === 'ArrowLeft' && e.target.selectionStart === 0 && pageData.page > 1) { e.preventDefault(); setPage((p) => p - 1); return; }
    if (e.key === 'Enter' && optionRows[active]) { e.preventDefault(); select(optionRows[active].item); }
  };

  if (!mounted) return null;

  const scopeList = (scopes || SEARCH_ENTITIES.map((e) => e.type)).filter((t) => t !== 'action');
  const scopeOptions = [
    { value: 'all', label: 'All', count: unscoped.length },
    ...scopeList.map((t) => {
      const meta = SEARCH_ENTITIES.find((e) => e.type === t);
      const c = counts[t] || 0;
      return { value: t, label: meta ? meta.label : t, count: c > 0 ? c : undefined, disabled: !c && scope !== t };
    }),
  ];
  const activeId = optionRows[active] ? `${baseId}-opt-${active}` : undefined;
  let optIndex = -1;

  return dialogPortal(
    <div
      className={['gt-palette-backdrop', closing ? 'gt-palette-backdrop--closing' : ''].filter(Boolean).join(' ')}
      onMouseDown={inline ? undefined : onScrimDown}
    >
      <div ref={panelRef} className={['gt-palette', className].filter(Boolean).join(' ')} role="dialog" aria-modal={inline ? undefined : 'true'} aria-label="Search">
        <div className="gt-palette__input-row">
          <span className="gt-palette__search-icon"><SearchGlyph /></span>
          <input
            ref={inputRef}
            className="gt-palette__input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck="false"
          />
          {(status === 'loading' || status === 'refetching') && <span className="gt-palette__spinner" role="status" aria-label="Searching" />}
          <button type="button" className="gt-palette__esc gt-kbd" onClick={requestClose} aria-label="Close search">esc</button>
        </div>

        {!idle && (
          <div className="gt-palette__scopes">
            <FilterChipGroup type="single" size="sm" ariaLabel="Filter by type" value={scope} onChange={setScope} options={scopeOptions} />
          </div>
        )}

        <div className="gt-palette__body">
          {showSkeleton && (
            <div aria-busy="true" aria-label="Loading results">
              {[0, 1, 2].map((i) => (
                <div key={i} className="gt-palette__skeleton"><span className="gt-palette__skeleton-icon" /><span className="gt-palette__skeleton-line" style={{ width: `${46 - i * 8}%` }} /></div>
              ))}
            </div>
          )}
          {showError && (
            <div className="gt-palette__state gt-palette__state--error" role="alert">
              <p className="gt-palette__state-title">Search isn't available right now</p>
              <p className="gt-palette__state-hint">Your connection may be offline. <button type="button" className="gt-palette__retry" onClick={() => setRemote((r) => ({ ...r, retryTick: (r.retryTick || 0) + 1 }))}>Try again</button></p>
            </div>
          )}
          {showEmpty && (
            <div className="gt-palette__state">
              <p className="gt-palette__state-title">No results for “{q}”</p>
              <p className="gt-palette__state-hint">Try a name, a task key like GT-12, or a project.</p>
            </div>
          )}
          {idle && recent.length === 0 && (
            <div className="gt-palette__state">
              <p className="gt-palette__state-title">Search GrepThink</p>
              <p className="gt-palette__state-hint">People, teams, projects, chats, and your tasks and stories. Press <Kbd>↵</Kbd> to open the highlighted result.</p>
            </div>
          )}
          {!showSkeleton && !showError && !showEmpty && (idle ? recent.length > 0 : true) && (
            <ul id={`${baseId}-list`} className="gt-palette__list" role="listbox" aria-label={idle ? 'Recent' : 'Results'}>
              {idle && <ResultGroup label="Recent" count={recent.length} />}
              {pageData.rows.map((row, i) => {
                if (row.kind === 'group') {
                  if (idle || scope !== 'all') return null;
                  return <ResultGroup key={`g${i}`} label={row.label} count={row.count} onSeeAll={row.count > 1 ? () => setScope(row.type) : undefined} />;
                }
                optIndex += 1;
                const idx = optIndex;
                return (
                  <ResultRow key={row.item.id} id={`${baseId}-opt-${idx}`} item={row.item} query={q} active={idx === active} onHover={() => setActive(idx)} onSelect={select} />
                );
              })}
            </ul>
          )}
        </div>

        <div className="gt-palette__footer">
          <div className="gt-palette__hints">
            <span className="gt-palette__hint"><Kbd keys={['↑', '↓']} /> navigate</span>
            <span className="gt-palette__hint"><Kbd>↵</Kbd> open</span>
            <span className="gt-palette__hint"><Kbd>esc</Kbd> close</span>
            <span className="gt-palette__hint"><Kbd keys={[modKey(), 'K']} /> toggle</span>
          </div>
          {!idle && <SearchPagination page={pageData.page} pages={pageData.pages} from={pageData.from} to={pageData.to} total={pageData.total} onChange={setPage} />}
        </div>
      </div>
    </div>,
    inline,
  );
}

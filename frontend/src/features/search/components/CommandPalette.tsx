import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { usePreview } from '@/lib/previewContext';
import { modKey } from '../format';
import { usePaletteHotkey } from '../hooks/usePaletteHotkey';
import type { SearchIndexState } from '../hooks/useSearchIndex';
import { pushRecent, readRecents } from '../recents';
import {
  countByType, entityLabel, itemKey, paginate, rankResults, PAGE_SIZE, SEARCH_ENTITIES,
  type PaletteRow, type SearchItem, type SearchScope,
} from '../searchModel';
import { Kbd } from './Kbd';
import { ResultGroup, ResultRow } from './ResultRow';
import { SearchPagination } from './SearchPagination';
import '../search.scss';

/** The exit animation's length (search.scss `gt-palette-out`). */
const CLOSE_MS = 150;

export interface CommandPaletteProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  userId: string | null;
  index: SearchIndexState;
}

/**
 * Global ⌘K search. Mounted once in AppView; renders nothing while closed. The dialog's own
 * state (query, scope, page, active row) lives in `PaletteDialog`, which mounts per open, so
 * every open starts clean without any effect having to reset it.
 */
export function CommandPalette({ open, onOpen, onClose, userId, index }: CommandPaletteProps) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);

  const requestClose = useCallback(() => {
    if (closing || !open) return;
    setClosing(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setClosing(false);
      onClose();
    }, CLOSE_MS);
  }, [closing, open, onClose]);

  useEffect(() => {
    const clear = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
    return clear;
  }, []);

  const toggle = useCallback(() => {
    if (open) requestClose();
    else onOpen();
  }, [open, requestClose, onOpen]);
  usePaletteHotkey(toggle);

  if (!open && !closing) return null;
  return <PaletteDialog closing={closing} requestClose={requestClose} userId={userId} index={index} />;
}

interface PaletteDialogProps {
  closing: boolean;
  requestClose: () => void;
  userId: string | null;
  index: SearchIndexState;
}

const STAFF_ONLY_IN_PREVIEW = new Set<SearchItem['type']>(['assignment', 'class']);

function PaletteDialog({ closing, requestClose, userId, index }: PaletteDialogProps) {
  const navigate = useNavigate();
  const { visibleClasses, setSelectedClass } = useClass();
  const { isPreviewing } = usePreview();
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { items, status, refresh } = index;

  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState(0);
  const [recents] = useState<SearchItem[]>(() => readRecents(userId));

  // Mount: focus the input, lock body scroll, warm the index; restore both on unmount.
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    refresh();
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      // Only when focus went nowhere: the page a result opened may have focused its own field.
      if (document.activeElement === document.body || document.activeElement === null) restoreTo?.focus?.();
    };
  }, [refresh]);

  // Esc closes from anywhere while open, even with focus on <body> under a control that
  // unmounted or turned disabled. Capture + stopPropagation keeps the page's own document
  // Escape listeners (the board's modals) from also firing. An Esc that cancels an IME
  // composition is the IME's (Safari's arrives with keyCode 229).
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      e.stopPropagation();
      requestClose();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => document.removeEventListener('keydown', onEsc, true);
  }, [requestClose]);

  // "View class as student": staff-only rows are not for the previewed role (spec §1).
  const visible = useMemo(
    () => (isPreviewing ? items.filter((i) => !STAFF_ONLY_IN_PREVIEW.has(i.type)) : items),
    [items, isPreviewing],
  );
  const recentList = useMemo(
    () => (isPreviewing ? recents.filter((i) => !STAFF_ONLY_IN_PREVIEW.has(i.type)) : recents),
    [recents, isPreviewing],
  );
  const q = query.trim();
  const idle = q === '';
  const recentKeys = useMemo(() => recents.map(itemKey), [recents]);
  const unscoped = useMemo(() => (idle ? [] : rankResults(visible, q, { recentKeys })), [visible, q, idle, recentKeys]);
  const counts = useMemo(() => countByType(unscoped), [unscoped]);
  const ranked = useMemo(() => (scope === 'all' ? unscoped : unscoped.filter((i) => i.type === scope)), [unscoped, scope]);
  const list = idle ? recentList : ranked;
  const pageData = useMemo(() => paginate(list, page, PAGE_SIZE), [list, page]);
  const rows = useMemo(() => {
    // Options are numbered across the page (aria-activedescendant); group labels get -1.
    const options = pageData.rows.filter((row) => row.kind === 'item');
    return pageData.rows.map((row: PaletteRow) => ({ row, idx: row.kind === 'item' ? options.indexOf(row) : -1 }));
  }, [pageData]);
  const optionCount = rows.filter((r) => r.idx >= 0).length;
  const activeIdx = optionCount ? Math.min(active, optionCount - 1) : -1;
  const activeItem = activeIdx >= 0 ? rows.find((r) => r.idx === activeIdx)?.row : undefined;

  const changeQuery = (value: string) => { setQuery(value); setPage(1); setActive(0); };
  // Refocus the input: a clicked "See all" unmounts, which would drop focus (and Esc) to <body>.
  const changeScope = (next: SearchScope) => { setScope(next); setPage(1); setActive(0); inputRef.current?.focus(); };
  const changePage = (next: number) => { setPage(next); setActive(0); };

  const select = (item: SearchItem) => {
    if (closing) return; // rows stay clickable during the exit animation
    // Persist only: re-ranking with the new recent would reshuffle the list during the fade.
    pushRecent(userId, item, recents);
    if (item.type === 'class') {
      // The sidebar's list: a class the user hid is not selected, only navigated to.
      const cls = visibleClasses.find((c) => c.id === item.id);
      if (cls) setSelectedClass(cls);
    }
    navigate(item.href);
    requestClose();
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // Safari fires compositionend before the committing Enter's keydown, which arrives with keyCode 229.
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    const { selectionStart, selectionEnd } = e.currentTarget;
    const caret = selectionStart ?? 0;
    const collapsed = selectionStart === selectionEnd; // over a selection, ← → collapse it instead
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (optionCount) setActive((activeIdx + 1) % optionCount);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (optionCount) setActive((activeIdx - 1 + optionCount) % optionCount);
        return;
      case 'Home':
        if (optionCount) { e.preventDefault(); setActive(0); }
        return;
      case 'End':
        if (optionCount) { e.preventDefault(); setActive(optionCount - 1); }
        return;
      case 'PageDown':
        if (pageData.page < pageData.pages) { e.preventDefault(); changePage(pageData.page + 1); }
        return;
      case 'PageUp':
        if (pageData.page > 1) { e.preventDefault(); changePage(pageData.page - 1); }
        return;
      case 'ArrowRight':
        if (collapsed && caret === query.length && pageData.page < pageData.pages) { e.preventDefault(); changePage(pageData.page + 1); }
        return;
      case 'ArrowLeft':
        if (collapsed && caret === 0 && pageData.page > 1) { e.preventDefault(); changePage(pageData.page - 1); }
        return;
      case 'Enter':
        if (activeItem && activeItem.kind === 'item') { e.preventDefault(); select(activeItem.item); }
        return;
      default:
    }
  };

  const showSkeleton = !idle && status === 'loading' && visible.length === 0;
  const showError = !idle && status === 'error' && visible.length === 0;
  const showEmpty = !idle && !showSkeleton && !showError && ranked.length === 0;
  const showIdleHint = idle && recentList.length === 0;
  const showList = !showSkeleton && !showError && !showEmpty && !showIdleHint;
  const activeId = activeIdx >= 0 ? `${baseId}-opt-${activeIdx}` : undefined;

  // Portaled to <body>, so no ancestor's stacking context can cap its --gt-z-palette layer.
  return createPortal(
    <div
      className={`gt-palette-backdrop${closing ? ' gt-palette-backdrop--closing' : ''}`}
      onMouseDown={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className={`gt-palette${closing ? ' gt-palette--closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        tabIndex={-1}
      >
        <div className="gt-palette__input-row">
          <span className="gt-palette__search-icon"><Search size={18} /></span>
          <input
            ref={inputRef}
            className="gt-palette__input"
            type="text"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search people, projects, tasks…"
            role="combobox"
            aria-expanded={showList}
            aria-controls={showList ? `${baseId}-list` : undefined}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
          />
          {(status === 'loading' || status === 'refetching') && (
            <span className="gt-palette__spinner" role="status" aria-label="Searching" />
          )}
          <button type="button" className="gt-palette__esc gt-kbd" onClick={requestClose} aria-label="Close search">
            esc
          </button>
        </div>

        {!idle && (
          <div className="gt-palette__scopes" role="group" aria-label="Filter by type">
            <button
              type="button"
              className={`gt-scope${scope === 'all' ? ' gt-scope--active' : ''}`}
              aria-pressed={scope === 'all'}
              onClick={() => changeScope('all')}
            >
              All <span className="gt-scope__count">{unscoped.length}</span>
            </button>
            {SEARCH_ENTITIES.map(({ type }) => {
              const count = counts[type] ?? 0;
              return (
                <button
                  key={type}
                  type="button"
                  className={`gt-scope${scope === type ? ' gt-scope--active' : ''}`}
                  aria-pressed={scope === type}
                  disabled={count === 0 && scope !== type}
                  onClick={() => changeScope(type)}
                >
                  {entityLabel(type)}
                  {count > 0 && <> <span className="gt-scope__count">{count}</span></>}
                </button>
              );
            })}
          </div>
        )}

        <div className="gt-palette__body">
          {showSkeleton && (
            <div aria-busy="true" aria-label="Loading results">
              {[0, 1, 2].map((i) => (
                <div key={i} className="gt-palette__skeleton">
                  <span className="gt-palette__skeleton-icon" />
                  <span className="gt-palette__skeleton-line" style={{ width: `${46 - i * 8}%` }} />
                </div>
              ))}
            </div>
          )}
          {showError && (
            <div className="gt-palette__state gt-palette__state--error" role="alert">
              <p className="gt-palette__state-title">Search isn’t available right now</p>
              <p className="gt-palette__state-hint">
                Your connection may be offline.{' '}
                <button type="button" className="gt-palette__retry" onClick={() => { refresh(true); inputRef.current?.focus(); }}>Try again</button>
              </p>
            </div>
          )}
          {showEmpty && (
            <div className="gt-palette__state">
              <p className="gt-palette__state-title">No results for “{q}”</p>
              <p className="gt-palette__state-hint">Try a name, a task key like GT-12, or a project.</p>
            </div>
          )}
          {showIdleHint && (
            <div className="gt-palette__state">
              <p className="gt-palette__state-title">Search GrepThink</p>
              <p className="gt-palette__state-hint">
                People, projects, chats, classes, assignments, and your tasks and stories. Press <Kbd>↵</Kbd> to open the highlighted result.
              </p>
            </div>
          )}
          {showList && (
            <ul id={`${baseId}-list`} className="gt-palette__list" role="listbox" aria-label={idle ? 'Recent' : 'Results'}>
              {idle && <ResultGroup label="Recent" count={recentList.length} />}
              {rows.map(({ row, idx }, i) => {
                if (row.kind === 'group') {
                  if (idle || scope !== 'all') return null;
                  return <ResultGroup key={`g${i}`} label={row.label} count={row.count} onSeeAll={() => changeScope(row.type)} />;
                }
                return (
                  <ResultRow
                    key={itemKey(row.item)}
                    id={`${baseId}-opt-${idx}`}
                    item={row.item}
                    query={q}
                    active={idx === activeIdx}
                    onHover={() => setActive(idx)}
                    onSelect={select}
                  />
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
          {!idle && (
            <SearchPagination page={pageData.page} pages={pageData.pages} from={pageData.from} to={pageData.to} total={pageData.total} onChange={changePage} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

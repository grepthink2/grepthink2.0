import React from 'react';
import { FieldShell } from './FieldShell.jsx';
import { Tag } from '../display/Tag.jsx';
import { Avatar } from '../display/Avatar.jsx';
import { Spinner } from '../feedback/Spinner.jsx';

const Chevron = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
const Check = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
const Plus = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;

/** Default client-side filter: case-insensitive match on label or description. */
export const comboFilter = (opt, q) => {
  if (!q) return true;
  const s = q.toLowerCase();
  return opt.label.toLowerCase().includes(s) || String(opt.description || '').toLowerCase().includes(s);
};

/**
 * Shared combobox — WAI-ARIA combobox with a listbox popup and aria-activedescendant.
 * Single select with type-to-filter · multi-select with Tag chips and an optional `max` ·
 * async `loadOptions` (debounced; loading / empty / error rows) · `creatable` entries
 * ("Add “React”", validated emails) · grouped options · rows with an avatar or icon and a
 * second line (the MentionListbox row). Not for the ⌘K palette or the class / school switchers.
 */
export function Combobox({
  id, label, hideLabel = false, helperText, error, required = false, optional = false, disabled = false,
  placeholder, compact = false, options = [], value, onChange, multiple = false, max,
  loadOptions, debounceMs = 250, minQueryLength = 1,
  creatable = false, validateCreate, onCreate, createLabel = (q) => `Add “${q}”`,
  emptyText = 'No matches', loadingText = 'Searching…', errorText = 'Couldn’t load results. Keep typing to try again.',
  minQueryText = 'Type to search', filter = comboFilter, defaultOpen = false, className = '',
}) {
  const reactId = React.useId();
  const listId = `${id || reactId}-list`;
  const [query, setQuery] = React.useState(multiple ? '' : null);
  const [open, setOpen] = React.useState(!!defaultOpen);
  const [active, setActive] = React.useState(-1);
  const [remote, setRemote] = React.useState({ status: 'idle', options: [] });
  const [createError, setCreateError] = React.useState('');
  const [live, setLive] = React.useState('');
  const inputRef = React.useRef(null);
  const popupRef = React.useRef(null);
  const known = React.useRef(new Map());
  const loader = React.useRef(loadOptions);
  loader.current = loadOptions;
  const reqId = React.useRef(0);

  const selected = multiple ? (Array.isArray(value) ? value : []) : (value != null && value !== '' ? [value] : []);
  const q = (query || '').trim();
  options.forEach((o) => known.current.set(o.value, o));
  remote.options.forEach((o) => known.current.set(o.value, o));
  const optionFor = (v) => known.current.get(v) || { value: v, label: String(v) };

  React.useEffect(() => {
    if (!loader.current || !open) return undefined;
    if (q.length < minQueryLength) { setRemote({ status: 'idle', options: [] }); return undefined; }
    const my = ++reqId.current;
    setRemote((r) => ({ status: 'loading', options: r.options }));
    const t = setTimeout(() => {
      Promise.resolve(loader.current(q))
        .then((res) => { if (my === reqId.current) setRemote({ status: 'done', options: res || [] }); })
        .catch(() => { if (my === reqId.current) setRemote({ status: 'error', options: [] }); });
    }, debounceMs);
    return () => clearTimeout(t);
  }, [q, open, debounceMs, minQueryLength]);

  const source = loadOptions ? remote.options : options.filter((o) => filter(o, q));
  const atMax = multiple && max != null && selected.length >= max;
  const lower = q.toLowerCase();
  const exact = source.some((o) => o.label.toLowerCase() === lower) || selected.some((v) => optionFor(v).label.toLowerCase() === lower);
  const showCreate = creatable && !!q && !exact && remote.status !== 'loading';
  const createInvalid = showCreate && validateCreate ? validateCreate(q) : null;
  const rows = source.map((o) => ({ kind: 'option', o, disabled: !!o.disabled || (atMax && !selected.includes(o.value)) }));
  if (showCreate) rows.push({ kind: 'create', o: { value: q, label: q }, disabled: !!createInvalid || atMax });
  const enabled = rows.map((r, i) => (r.disabled ? -1 : i)).filter((i) => i >= 0);

  const status = loadOptions && remote.status === 'loading' ? loadingText
    : loadOptions && remote.status === 'error' ? errorText
      : loadOptions && q.length < minQueryLength ? minQueryText
        : rows.length === 0 ? emptyText : null;

  React.useEffect(() => {
    if (!open) { setLive(''); return undefined; }
    const t = setTimeout(() => setLive(status && status !== loadingText ? status : `${source.length} result${source.length === 1 ? '' : 's'} available`), 500);
    return () => clearTimeout(t);
  }, [open, status, source.length, loadingText]);

  React.useEffect(() => {
    const p = popupRef.current;
    if (!open || active < 0 || !p) return;
    const el = p.querySelector(`[data-index="${active}"]`);
    if (!el) return;
    const top = el.offsetTop; const bottom = top + el.offsetHeight;
    if (top < p.scrollTop) p.scrollTop = top - 4;
    else if (bottom > p.scrollTop + p.clientHeight) p.scrollTop = bottom - p.clientHeight + 4;
  }, [active, open]);

  const move = (dir) => {
    if (!enabled.length) return;
    const pos = enabled.indexOf(active);
    setActive(pos < 0 ? enabled[dir > 0 ? 0 : enabled.length - 1] : enabled[(pos + dir + enabled.length) % enabled.length]);
  };
  const choose = (row) => {
    if (!row) return;
    if (row.disabled) { if (row.kind === 'create' && createInvalid) setCreateError(createInvalid); return; }
    if (row.kind === 'create') {
      known.current.set(q, { value: q, label: q });
      if (onCreate) onCreate(q);
      if (onChange) onChange(multiple ? [...selected, q] : q);
    } else if (multiple) {
      const v = row.o.value;
      if (onChange) onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    } else if (onChange) onChange(row.o.value);
    setCreateError('');
    setActive(-1);
    if (multiple) setQuery(''); else { setQuery(null); setOpen(false); }
  };
  const removeValue = (v) => { if (onChange) onChange(selected.filter((x) => x !== v)); if (inputRef.current) inputRef.current.focus(); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); if (!e.altKey) setActive(enabled.length ? enabled[0] : -1); } else move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(enabled.length ? enabled[enabled.length - 1] : -1); } else move(-1);
    } else if (e.key === 'Enter') {
      if (open && active >= 0) { e.preventDefault(); choose(rows[active]); }
      else if (open && showCreate) { e.preventDefault(); choose(rows[rows.length - 1]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1); }
      else if (query) { e.preventDefault(); e.stopPropagation(); setQuery(multiple ? '' : null); }
    } else if (e.key === 'Backspace') {
      if (multiple && !query && selected.length) { e.preventDefault(); removeValue(selected[selected.length - 1]); }
    } else if (e.key === 'Tab') { setOpen(false); setActive(-1); }
  };
  const onBlur = (e) => {
    const root = e.currentTarget.closest('.gt-combobox');
    if (e.relatedTarget && root && root.contains(e.relatedTarget)) return;
    setOpen(false); setActive(-1); setQuery(multiple ? '' : null);
  };

  const groups = [];
  const gIndex = new Map();
  rows.forEach((r, i) => {
    const g = r.kind === 'create' ? '' : (r.o.group || '');
    if (!gIndex.has(g)) { gIndex.set(g, groups.length); groups.push({ name: g, items: [] }); }
    groups[gIndex.get(g)].items.push([r, i]);
  });
  const inputValue = multiple ? (query || '') : (query !== null ? query : (selected[0] != null ? optionFor(selected[0]).label : ''));

  const renderRow = ([r, i]) => {
    const isSel = r.kind === 'option' && selected.includes(r.o.value);
    const av = r.o.avatar;
    return (
      <div
        key={`${r.kind}-${r.o.value}`}
        id={`${listId}-${i}`}
        data-index={i}
        role="option"
        aria-selected={isSel}
        aria-disabled={r.disabled || undefined}
        className={['gt-combobox__option', i === active ? 'gt-combobox__option--active' : '', r.kind === 'create' ? 'gt-combobox__option--create' : ''].filter(Boolean).join(' ')}
        onMouseDown={(e) => { e.preventDefault(); choose(r); }}
        onMouseMove={() => { if (!r.disabled && active !== i) setActive(i); }}
      >
        {r.kind === 'create' ? <span className="gt-combobox__option-media"><Plus /></span>
          : av ? <span className="gt-combobox__option-media"><Avatar name={typeof av === 'string' ? av : av.name} src={typeof av === 'string' ? undefined : av.src} size="sm" decorative /></span>
            : r.o.icon ? <span className="gt-combobox__option-media" aria-hidden="true">{r.o.icon}</span> : null}
        <span className="gt-combobox__option-text">
          <span className="gt-combobox__option-label">{r.kind === 'create' ? createLabel(q) : r.o.label}</span>
          {r.kind === 'create' && createInvalid
            ? <span className="gt-combobox__option-desc">{createInvalid}</span>
            : r.o.description && <span className="gt-combobox__option-desc">{r.o.description}</span>}
        </span>
        {isSel && <span className="gt-combobox__check"><Check /></span>}
      </div>
    );
  };

  return (
    <FieldShell id={id} label={label} hideLabel={hideLabel} optional={optional} helperText={helperText}
      error={error || createError || undefined} disabled={disabled} className={className}>
      {({ id: inputId, labelId, describedBy, invalid }) => (
        <div className={['gt-combobox', compact ? 'gt-combobox--compact' : '', disabled ? 'gt-combobox--disabled' : ''].filter(Boolean).join(' ')}>
          <div className="gt-combobox__control" onMouseDown={(e) => {
            if (disabled || e.target !== e.currentTarget) return;
            e.preventDefault(); if (inputRef.current) inputRef.current.focus(); setOpen(true);
          }}>
            {multiple && selected.map((v) => {
              const o = optionFor(v);
              return <Tag key={v} onRemove={disabled ? undefined : () => removeValue(v)} removeLabel={`Remove ${o.label}`}>{o.label}</Tag>;
            })}
            <input
              ref={inputRef}
              id={inputId}
              className="gt-combobox__input"
              role="combobox"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-autocomplete="list"
              aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              aria-required={required || undefined}
              value={inputValue}
              placeholder={multiple && selected.length ? '' : placeholder}
              disabled={disabled}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1); setCreateError(''); }}
              onKeyDown={onKeyDown}
              onFocus={(e) => { if (!multiple) e.target.select(); }}
              onClick={() => { if (!disabled) setOpen(true); }}
              onBlur={onBlur}
            />
          </div>
          <span className="gt-combobox__chevron"><Chevron /></span>
          {open && !disabled && (
            <div className="gt-combobox__popup" ref={popupRef}>
              {atMax && <div className="gt-combobox__status">You can choose up to {max}. Remove one to pick another.</div>}
              {status && (
                <div className={['gt-combobox__status', remote.status === 'error' && loadOptions ? 'gt-combobox__status--error' : ''].filter(Boolean).join(' ')}>
                  {loadOptions && remote.status === 'loading' && <Spinner size={14} decorative />}{status}
                </div>
              )}
              <div role="listbox" id={listId} aria-labelledby={labelId} aria-multiselectable={multiple || undefined}>
                {groups.map((g, gi) => (g.name ? (
                  <div key={g.name} role="group" aria-labelledby={`${listId}-g${gi}`} className="gt-combobox__group">
                    <div className="gt-combobox__group-label" id={`${listId}-g${gi}`} role="presentation">{g.name}</div>
                    {g.items.map(renderRow)}
                  </div>
                ) : <React.Fragment key={`_${gi}`}>{g.items.map(renderRow)}</React.Fragment>))}
              </div>
            </div>
          )}
          <span className="gt-visually-hidden" aria-live="polite">{live}</span>
        </div>
      )}
    </FieldShell>
  );
}

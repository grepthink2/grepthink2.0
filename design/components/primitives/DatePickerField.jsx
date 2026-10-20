import React from 'react';
import { FieldShell } from './FieldShell.jsx';
import { Button } from './Button.jsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const same = (a, b) => !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const fmtDate = (d) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
const fmtTime = (t) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`; };
const portal = (node) => (typeof window !== 'undefined' && window.ReactDOM && window.ReactDOM.createPortal
  ? window.ReactDOM.createPortal(node, document.body) : node);

/** 'yyyy-MM-dd' or 'yyyy-MM-dd HH:mm' → { date, time } (local; date-only strings never shift across zones). */
export function parseDateValue(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/.exec(value || '');
  return m ? { date: new Date(+m[1], +m[2] - 1, +m[3]), time: m[4] ? `${m[4]}:${m[5]}` : '' } : null;
}

const CalendarGlyph = () => (
  <svg className="dpf__trigger-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>
);

/**
 * Date (and optional time) picker — the codebase's DatePickerField API (string values).
 * Trigger: a button named by the label + the chosen value, `aria-haspopup="dialog"`, `aria-expanded`.
 * Calendar: a modal dialog portaled to <body> (z 1100, above modals), placed below the trigger or
 * flipped above when it does not fit. Arrow keys move by day / week, Home / End to the week's ends,
 * PageUp / PageDown by month (Shift: year), Enter picks, Esc closes and returns focus to the trigger.
 * `showTime` adds a labelled time input and Cancel / Done.
 */
export function DatePickerField({
  id, label, value = '', onChange, showTime = false, disabledBefore, disabledAfter,
  disabled = false, required = false, optional = false, error, helperText, placeholder, className = '',
}) {
  const parsed = parseDateValue(value);
  const today = dayOf(new Date());
  const [open, setOpen] = React.useState(false);
  const [focusDay, setFocusDay] = React.useState(parsed ? parsed.date : today);
  const [draftDate, setDraftDate] = React.useState(null);
  const [draftTime, setDraftTime] = React.useState('09:00');
  const [pos, setPos] = React.useState({ top: 0, left: 0, up: false });
  const triggerRef = React.useRef(null);
  const popRef = React.useRef(null);
  const toGrid = React.useRef(true);
  const reactId = React.useId();
  const off = (d) => (disabledBefore && d < dayOf(disabledBefore)) || (disabledAfter && d > dayOf(disabledAfter));

  const openPicker = () => {
    if (disabled) return;
    setFocusDay(parsed ? parsed.date : today);
    setDraftDate(parsed ? parsed.date : null);
    setDraftTime(parsed && parsed.time ? parsed.time : '09:00');
    toGrid.current = true;
    setOpen(true);
  };
  const close = (refocus = true) => { setOpen(false); if (refocus && triggerRef.current) triggerRef.current.focus(); };

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const t = triggerRef.current; const p = popRef.current;
      if (!t || !p) return;
      const r = t.getBoundingClientRect(); const h = p.offsetHeight; const w = p.offsetWidth;
      const vh = window.innerHeight; const vw = document.documentElement.clientWidth;
      const up = vh - r.bottom < h + 12 && r.top > vh - r.bottom;
      setPos({ up, top: up ? Math.max(8, r.top - h - 6) : Math.min(r.bottom + 6, vh - h - 8), left: Math.max(8, Math.min(r.left, vw - w - 8)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, showTime]);

  React.useEffect(() => {
    if (!open || !toGrid.current || !popRef.current) return;
    const el = popRef.current.querySelector('[data-focus="true"]');
    if (el) el.focus();
  }, [open, focusDay]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab' || !popRef.current) return;
      const list = Array.from(popRef.current.querySelectorAll('button, input')).filter((el) => !el.disabled && el.tabIndex !== -1);
      if (!list.length) return;
      const first = list[0]; const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const onDown = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) && triggerRef.current && !triggerRef.current.contains(e.target)) close(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDayKey = (e) => {
    const d = new Date(focusDay);
    const k = e.key;
    if (k === 'ArrowLeft') d.setDate(d.getDate() - 1);
    else if (k === 'ArrowRight') d.setDate(d.getDate() + 1);
    else if (k === 'ArrowUp') d.setDate(d.getDate() - 7);
    else if (k === 'ArrowDown') d.setDate(d.getDate() + 7);
    else if (k === 'Home') d.setDate(d.getDate() - d.getDay());
    else if (k === 'End') d.setDate(d.getDate() + (6 - d.getDay()));
    else if (k === 'PageUp') d.setMonth(d.getMonth() - (e.shiftKey ? 12 : 1));
    else if (k === 'PageDown') d.setMonth(d.getMonth() + (e.shiftKey ? 12 : 1));
    else return;
    e.preventDefault();
    toGrid.current = true;
    setFocusDay(d);
  };
  const pick = (d) => {
    if (off(d)) return;
    if (showTime) { setDraftDate(d); setFocusDay(d); return; }
    if (onChange) onChange(toKey(d));
    close();
  };
  const done = () => {
    if (!draftDate) return;
    if (onChange) onChange(`${toKey(draftDate)} ${draftTime || '09:00'}`);
    close();
  };
  const shiftMonth = (n) => { toGrid.current = false; setFocusDay((f) => new Date(f.getFullYear(), f.getMonth() + n, 1)); };

  const y = focusDay.getFullYear(); const m = focusDay.getMonth();
  const cells = Array(new Date(y, m, 1).getDay()).fill(null);
  for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) cells.push(new Date(y, m, d));
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const chosen = showTime ? draftDate : parsed && parsed.date;
  const valueText = parsed
    ? `${fmtDate(parsed.date)}${showTime && parsed.time ? ` · ${fmtTime(parsed.time)}` : ''}`
    : placeholder || (showTime ? 'Select date & time' : 'Select a date');
  const titleId = `${reactId}-title`;

  return (
    <FieldShell id={id} label={label} optional={optional} helperText={helperText} error={error} disabled={disabled}
      className={['dpf', error ? 'dpf--error' : '', className].filter(Boolean).join(' ')}>
      {({ id: triggerId, labelId, describedBy }) => (
        <>
          <button
            ref={triggerRef}
            id={triggerId}
            type="button"
            className={['dpf__trigger', open ? 'dpf__trigger--open' : '', parsed ? 'dpf__trigger--filled' : ''].filter(Boolean).join(' ')}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-labelledby={[labelId, `${triggerId}-value`, required ? `${triggerId}-req` : ''].filter(Boolean).join(' ')}
            aria-describedby={describedBy}
            disabled={disabled}
            onClick={() => (open ? close() : openPicker())}
          >
            <span className="dpf__trigger-text" id={`${triggerId}-value`}>{valueText}</span>
            {required && <span className="gt-visually-hidden" id={`${triggerId}-req`}>required</span>}
            <CalendarGlyph />
          </button>
          {open && portal(
            <div ref={popRef} className={['dpf__popover', pos.up ? 'dpf__popover--up' : ''].filter(Boolean).join(' ')}
              role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ top: pos.top, left: pos.left }}>
              <div className="dpf__cal-head">
                <button type="button" className="dpf__cal-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
                <span className="dpf__cal-title" id={titleId} aria-live="polite">{MONTHS[m]} {y}</span>
                <button type="button" className="dpf__cal-nav" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
              </div>
              <table className="dpf__cal-grid" role="grid" aria-labelledby={titleId}>
                <thead>
                  <tr>{DAYS.map((d) => <th key={d} scope="col" abbr={d} className="dpf__cal-weekday">{d.slice(0, 2)}</th>)}</tr>
                </thead>
                <tbody>
                  {weeks.map((wk, r) => (
                    <tr key={r}>
                      {wk.map((d, c) => (d ? (
                        <td key={c} aria-selected={same(d, chosen)}>
                          <button
                            type="button"
                            className={['dpf__cal-day', same(d, chosen) ? 'dpf__cal-day--selected' : '', same(d, today) && !same(d, chosen) ? 'dpf__cal-day--today' : ''].filter(Boolean).join(' ')}
                            tabIndex={same(d, focusDay) ? 0 : -1}
                            data-focus={same(d, focusDay) ? 'true' : undefined}
                            aria-label={`${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`}
                            aria-current={same(d, today) ? 'date' : undefined}
                            aria-disabled={off(d) || undefined}
                            onKeyDown={onDayKey}
                            onClick={() => pick(d)}
                          >
                            {d.getDate()}
                          </button>
                        </td>
                      ) : <td key={c} />))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {showTime && (
                <>
                  <div className="dpf__time">
                    <div className="gt-field">
                      <label className="gt-field__label" htmlFor={`${reactId}-time`}>Time</label>
                      <input id={`${reactId}-time`} type="time" step={900} className="gt-input gt-input--compact" value={draftTime} onChange={(e) => setDraftTime(e.target.value)} />
                    </div>
                  </div>
                  <div className="dpf__footer">
                    <Button variant="outline" size="sm" onClick={() => close()}>Cancel</Button>
                    <Button size="sm" onClick={done} disabled={!draftDate}>Done</Button>
                  </div>
                </>
              )}
            </div>,
          )}
        </>
      )}
    </FieldShell>
  );
}

import React from 'react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function fmt(date) {
  if (!date) return '';
  return `${MONTHS[date.getMonth()].slice(0,3)} ${date.getDate()}, ${date.getFullYear()}`;
}

/**
 * Date picker field — trigger button + calendar popover, mirroring the
 * app's DatePickerField (react-day-picker themed to the tokens).
 * `value` is a Date or null; `onChange` receives the picked Date.
 */
export function DatePickerField({
  label,
  value = null,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  className = '',
}) {
  const [open, setOpen] = React.useState(false);
  const today = new Date();
  const [view, setView] = React.useState(() => value || today);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const y = view.getFullYear();
  const m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSame = (d, date) =>
    date && d && date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;

  return (
    <div className={['dpf', className].filter(Boolean).join(' ')} ref={rootRef}>
      {label && <span className="dpf__label">{label}</span>}
      <button
        type="button"
        className={[
          'dpf__trigger',
          open ? 'dpf__trigger--open' : '',
          value ? 'dpf__trigger--filled' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="dpf__trigger-text">{value ? fmt(value) : placeholder}</span>
        <svg className="dpf__trigger-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
          <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div className="dpf__popover dpf__popover--inline" role="dialog" aria-label="Choose date">
          <div className="dpf__cal-head">
            <button type="button" className="dpf__cal-nav" aria-label="Previous month"
              onClick={() => setView(new Date(y, m - 1, 1))}>‹</button>
            <span className="dpf__cal-title">{MONTHS[m]} {y}</span>
            <button type="button" className="dpf__cal-nav" aria-label="Next month"
              onClick={() => setView(new Date(y, m + 1, 1))}>›</button>
          </div>
          <div className="dpf__cal-grid" role="grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="dpf__cal-weekday">{w}</span>
            ))}
            {cells.map((d, i) =>
              d === null ? (
                <span key={`e${i}`} />
              ) : (
                <button
                  key={d}
                  type="button"
                  className={[
                    'dpf__cal-day',
                    isSame(d, value) ? 'dpf__cal-day--selected' : '',
                    isSame(d, today) && !isSame(d, value) ? 'dpf__cal-day--today' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => {
                    onChange && onChange(new Date(y, m, d));
                    setOpen(false);
                  }}
                >
                  {d}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

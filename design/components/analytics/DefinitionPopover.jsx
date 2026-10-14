import React from 'react';
import { AnalyticsIcon } from './ChartLegend.jsx';

/**
 * "How this is counted" (.gt-definition) — an ⓘ trigger opening the shared popover
 * below it, aligned to the ⓘ: 16px padding around a text column ≤ 320px (or the
 * viewport less 48px when narrower). Where the panel would run off the screen it
 * moves left just enough to keep 8px from the viewport edge; it is centred when the
 * viewport is less than 16px wider than the panel. Closes on Esc / outside click;
 * never traps focus.
 */
export function DefinitionPopover({ title = 'How this is counted', body, learnMoreHref, placement = 'bottom', align = 'start', className = '' }) {
  const [open, setOpen] = React.useState(false);
  const [shift, setShift] = React.useState(0);
  const ref = React.useRef(null);
  const panelRef = React.useRef(null);
  const id = React.useId();
  React.useEffect(() => {
    if (!open) return undefined;
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', down);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('mousedown', down); };
  }, [open]);
  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      if (!ref.current || !panelRef.current) return;
      const vw = document.documentElement.clientWidth;
      const trig = ref.current.getBoundingClientRect();
      const pw = panelRef.current.offsetWidth;
      if (vw < pw + 16) { setShift((vw - pw) / 2 - trig.left); return; }       // centred
      const right = trig.left + pw;
      setShift(right > vw - 8 ? (vw - 8) - right : 0);                          // keep 8px from the edge
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  return (
    <span className={['gt-definition', className].filter(Boolean).join(' ')} ref={ref}>
      <button
        type="button"
        className="gt-definition__trigger"
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <AnalyticsIcon name="info" size={15} />
      </button>
      {open && (
        <div id={id} ref={panelRef} role="dialog" aria-label={title} className={`gt-popover gt-popover--${placement} gt-popover--${align} gt-definition__panel`} style={{ left: shift }}>
          <div className="gt-definition__title">{title}</div>
          <p className="gt-definition__body">{body}</p>
          {learnMoreHref && <a className="gt-definition__more" href={learnMoreHref}>Learn more</a>}
        </div>
      )}
    </span>
  );
}

import React from 'react';

const InfoGlyph = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
);

/**
 * ⓘ trigger + explanation panel on the Popover surface — the shared InfoPopover, promoted from
 * analytics' DefinitionPopover. Opens on click / Enter / Space, closes on Esc (captured, so an
 * enclosing modal stays open; focus returns to the ⓘ) or an outside click; never traps focus.
 * The panel is a ≤ 320px text column in 16px padding, nudged to stay 8px inside the viewport.
 * Use it for explanations, and beside a disabled control to say why it is disabled.
 */
export function InfoPopover({ title, body, learnMoreHref, label, placement = 'bottom', align = 'start', className = '' }) {
  const [open, setOpen] = React.useState(false);
  const [shift, setShift] = React.useState(0);
  const ref = React.useRef(null);
  const trigRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const id = React.useId();
  React.useEffect(() => {
    if (!open) return undefined;
    const key = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      if (trigRef.current) trigRef.current.focus();
    };
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', key, true);
    document.addEventListener('mousedown', down);
    return () => { document.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', down); };
  }, [open]);
  React.useLayoutEffect(() => {
    if (!open || align !== 'start') return undefined;
    const place = () => {
      if (!ref.current || !panelRef.current) return;
      const vw = document.documentElement.clientWidth;
      const trig = ref.current.getBoundingClientRect();
      const pw = panelRef.current.offsetWidth;
      if (vw < pw + 16) { setShift((vw - pw) / 2 - trig.left); return; }
      const right = trig.left + pw;
      setShift(right > vw - 8 ? (vw - 8) - right : 0);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, align]);
  return (
    <span className={['gt-infopop', className].filter(Boolean).join(' ')} ref={ref}>
      <button
        ref={trigRef}
        type="button"
        className="gt-infopop__trigger"
        aria-label={label || title}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <InfoGlyph />
      </button>
      {open && (
        <div id={id} ref={panelRef} role="dialog" aria-labelledby={`${id}-title`}
          className={`gt-popover gt-popover--${placement} gt-popover--${align} gt-infopop__panel`} style={align === 'start' ? { left: shift } : undefined}>
          <p className="gt-infopop__title" id={`${id}-title`}>{title}</p>
          <div className="gt-infopop__body">{body}</div>
          {learnMoreHref && <a className="gt-infopop__more" href={learnMoreHref}>Learn more</a>}
        </div>
      )}
    </span>
  );
}

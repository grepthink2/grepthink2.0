import { useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { Info } from 'lucide-react';
import { Popover } from '@/components/Popover/Popover';
import './InfoPopover.scss';

export interface InfoPopoverProps {
  /** The panel's heading, which names it; also the trigger's name unless `label` is set. */
  title: string;
  body: ReactNode;
  /** Adds a "Learn more" link. */
  learnMoreHref?: string;
  /** The ⓘ's accessible name ("About TSRs submitted", "How Messages is counted"). @default title */
  label?: string;
  /** @default 'bottom' */
  placement?: 'bottom' | 'top';
  /** @default 'start' */
  align?: 'start' | 'end';
  /** Goes on the wrapper. */
  className?: string;
  /** Reaches the ⓘ button. */
  ref?: Ref<HTMLButtonElement>;
}

/** The least space kept between the open panel and either side of the viewport, when the viewport has that much to spare. */
const EDGE = 8;

/**
 * An ⓘ that opens an explanation, ported from design/components/display/InfoPopover.jsx (promoted from
 * analytics' DefinitionPopover): for what a metric counts, or why a control beside it is disabled. The
 * trigger is a real button (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`) that opens on a
 * click, Enter or Space a non-modal dialog on the shared Popover's surface, labelled by its title, with
 * the body and an optional "Learn more" link. Esc closes it (Popover takes it in the capture phase, so
 * a dialog around it stays open) and an outside press too; focus is never trapped, and an Esc from
 * inside the panel gives focus back to the ⓘ.
 *
 * Kept from DefinitionPopover: the panel hangs from the ⓘ, so on a phone it could run off the screen.
 * Once open it moves just enough to stay EDGE px inside the viewport (centred with less than 2 × EDGE to
 * spare), measured before the browser paints and again when the window resizes. Codebase-side: an
 * end-aligned panel stays inside the viewport too, and `ref` reaches the ⓘ.
 */
export function InfoPopover({
  title, body, learnMoreHref, label, placement = 'bottom', align = 'start', className = '', ref,
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const panelId = `${id}-panel`;
  const titleId = `${id}-title`;
  useImperativeHandle(ref, () => triggerRef.current as HTMLButtonElement, []);

  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const panel = titleRef.current?.parentElement; // the Popover's surface
    if (!open || !trigger || !panel) return undefined;
    const place = () => {
      const box = trigger.getBoundingClientRect();
      const { width } = panel.getBoundingClientRect();
      const viewport = document.documentElement.clientWidth;
      // The panel's left side before any shift: at the ⓘ's left, or its right less the panel's width.
      const at = align === 'end' ? box.right - width : box.left;
      const edge = Math.min(EDGE, (viewport - width) / 2);
      setShift(Math.min(Math.max(at, edge), viewport - edge - width) - at);
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, align]);

  const close = () => {
    const active = document.activeElement;
    // Esc with focus in the panel ("Learn more"): the panel goes, so focus goes back to the ⓘ.
    const inPanel = active !== null && active !== triggerRef.current && rootRef.current?.contains(active);
    setOpen(false);
    if (inPanel) triggerRef.current?.focus();
  };

  let style;
  if (shift) style = align === 'end' ? { right: -shift } : { left: shift };

  return (
    <span className={['gt-infopop', className].filter(Boolean).join(' ')} ref={rootRef}>
      <Popover
        open={open}
        onClose={close}
        placement={placement}
        align={align}
        className="gt-infopop__panel"
        id={panelId}
        role="dialog"
        aria-labelledby={titleId}
        style={style}
        anchor={
          <button
            ref={triggerRef}
            type="button"
            className="gt-infopop__trigger"
            aria-label={label || title}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            onClick={() => setOpen((o) => !o)}
          >
            <Info size={15} aria-hidden="true" />
          </button>
        }
      >
        <p className="gt-infopop__title" id={titleId} ref={titleRef}>{title}</p>
        <div className="gt-infopop__body">{body}</div>
        {learnMoreHref && <a className="gt-infopop__more" href={learnMoreHref}>Learn more</a>}
      </Popover>
    </span>
  );
}

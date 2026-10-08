import { Info } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { Popover } from '@/components/Popover/Popover';

/** `title` and `body` are the definition ("How this is counted" and its text); `cardTitle` names the trigger after its card. */
export interface DefinitionPopoverProps { title: string; body: string; cardTitle: string }

/** The least space kept between the open panel and either side of the viewport, when the viewport has that much to spare. */
const EDGE = 8;

/**
 * "How this is counted": the ⓘ in a card header ("How Scrum board is counted") opens a plain-language definition, 320px at
 * most. The panel hangs from the ⓘ, which sits beside the card title, so on a phone it would run off the right of the screen:
 * once open it moves left just enough to stay EDGE px inside the viewport, never past its left side (with less than 2 × EDGE
 * to spare it is centred). It is measured before the browser paints, so it never shows where it would overflow.
 */
export function DefinitionPopover({ title, body, cardTitle }: DefinitionPopoverProps) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const trigger = triggerRef.current;
    const panel = bodyRef.current?.parentElement; // the Popover's surface
    if (!open || !trigger || !panel) return;
    const at = trigger.getBoundingClientRect().left; // the panel's left side before any shift: the Popover starts it at its anchor, the ⓘ
    const { width } = panel.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const edge = Math.min(EDGE, (viewport - width) / 2);
    setShift(Math.min(Math.max(at, edge), viewport - edge - width) - at);
  }, [open]);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      size="md"
      style={shift ? { left: shift } : undefined}
      anchor={
        <button ref={triggerRef} type="button" className="gt-definition__trigger" aria-label={`How ${cardTitle} is counted`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Info size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      }
    >
      <div ref={bodyRef} className="gt-definition">
        <p className="gt-definition__title">{title}</p>
        <p className="gt-definition__body">{body}</p>
      </div>
    </Popover>
  );
}

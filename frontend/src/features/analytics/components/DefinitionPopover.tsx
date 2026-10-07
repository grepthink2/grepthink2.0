import { Info } from 'lucide-react';
import { useState } from 'react';
import { Popover } from '@/components/Popover/Popover';

/** `title` and `body` are the definition ("How this is counted" and its text); `cardTitle` names the trigger after its card. */
export interface DefinitionPopoverProps { title: string; body: string; cardTitle: string }

/** "How this is counted": the ⓘ in a card header ("How Scrum board is counted") opens a plain-language definition, 320px at most. */
export function DefinitionPopover({ title, body, cardTitle }: DefinitionPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      size="md"
      anchor={
        <button type="button" className="gt-definition__trigger" aria-label={`How ${cardTitle} is counted`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Info size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      }
    >
      <div className="gt-definition">
        <p className="gt-definition__title">{title}</p>
        <p className="gt-definition__body">{body}</p>
      </div>
    </Popover>
  );
}

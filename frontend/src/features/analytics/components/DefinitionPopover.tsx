import { Info } from 'lucide-react';
import { useState } from 'react';
import { Popover } from '@/components/Popover/Popover';

export interface DefinitionPopoverProps { title: string; body: string }

/** "How this is counted": the ⓘ in a card header opens a 320px plain-language definition. */
export function DefinitionPopover({ title, body }: DefinitionPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      size="md"
      anchor={
        <button type="button" className="gt-definition__trigger" aria-label="How this is counted" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
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

import { useState } from 'react';
import { Settings } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { IconButton } from '@components/IconButton/IconButton';
import { Toggle } from '@components/Toggle/Toggle';
import { Popover } from './Popover';

export const meta: PreviewMeta = { group: 'Feedback', height: 200, expects: '.gt-popover' };

export default function PopoverPreview() {
  const [open, setOpen] = useState(true);
  const [compactCards, setCompactCards] = useState(false);
  const [points, setPoints] = useState(true);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      anchor={<IconButton ariaLabel="Board settings" onClick={() => setOpen(!open)}><Settings size={16} /></IconButton>}
    >
      <div className="ds-stack" style={{ width: 240, gap: 12 }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Board settings</p>
        <Toggle label="Compact cards" checked={compactCards} onChange={(e) => setCompactCards(e.target.checked)} />
        <Toggle label="Show story points" checked={points} onChange={(e) => setPoints(e.target.checked)} />
      </div>
    </Popover>
  );
}

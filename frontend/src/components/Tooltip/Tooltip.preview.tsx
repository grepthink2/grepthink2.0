import { Clock } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { Badge } from '@components/Badge/Badge';
import { Tooltip } from './Tooltip';

export const meta: PreviewMeta = { group: 'Display', height: 160, expects: '[role="tooltip"]' };

export default function TooltipPreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Hover one, or Tab to it: one short line, top (the default), bottom, left or right</p>
        <div className="ds-row" style={{ gap: 32, padding: '36px 0 36px 120px' }}>
          <Tooltip content="Percent contribution this sprint"><Badge tone="info">25%</Badge></Tooltip>
          <Tooltip content="Sprint 3 ends today" side="bottom"><Clock size={16} aria-label="Sprint end" /></Tooltip>
          <Tooltip content="Left" side="left"><Badge>Left</Badge></Tooltip>
          <Tooltip content="Right" side="right"><Badge>Right</Badge></Tooltip>
        </div>
      </section>
    </div>
  );
}

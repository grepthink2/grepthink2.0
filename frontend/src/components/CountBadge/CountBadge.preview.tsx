import type { PreviewMeta } from '@components/previewMeta';
import { CountBadge } from './CountBadge';

export const meta: PreviewMeta = { group: 'Display', height: 90 };

export default function CountBadgePreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Counts beside a label: list totals and tab counts</p>
        <div className="ds-row">
          <span className="ds-row">Members <CountBadge count={12} /></span>
          <span className="ds-row">Requests <CountBadge count={3} label="3 pending requests" /></span>
          <span className="ds-row">Past <CountBadge count={0} /></span>
          <span className="ds-row">Messages <CountBadge count={240} /></span>
        </div>
      </section>
    </div>
  );
}

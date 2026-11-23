import type { PreviewMeta } from '@components/previewMeta';
import { Skeleton } from './Skeleton';
import { TableSkeleton } from './TableSkeleton';

export const meta: PreviewMeta = { group: 'Feedback', height: 470 };

// A stand-in for a feature's list styles, which TableSkeleton draws with (the app's are the feature's own).
const LIST_STYLE = [
  '.ds-list__title { margin: 0 0 8px; font-size: 16px; font-weight: 600; }',
  '.ds-list__table { width: 100%; border-collapse: collapse; }',
  '.ds-list__table th { padding: 8px 12px; text-align: left; font-size: 13px; font-weight: 500; color: var(--gt-text-tertiary); background: var(--gt-surface-sunken); }',
  '.ds-list__table td { padding: 12px; border-bottom: 1px solid var(--gt-border-subtle); }',
].join('\n');

export default function SkeletonPreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section" aria-busy="true">
        <p className="ds-caption">Lines and a circle, shaped like what is coming</p>
        <div className="ds-row" style={{ alignItems: 'flex-start' }}>
          <Skeleton circle height={36} />
          <div className="ds-stack" style={{ gap: 8, flex: 1 }}>
            <Skeleton width="40%" height={14} />
            <Skeleton width="80%" height={12} />
            <Skeleton width="65%" height={12} />
          </div>
        </div>
        <Skeleton height={96} radius={10} />
      </section>
      <section className="ds-section">
        <p className="ds-caption">TableSkeleton: a feature's list table while it loads, in that feature's own classes (a stand-in here)</p>
        <style>{LIST_STYLE}</style>
        <TableSkeleton block="ds-list" title="Students" headers={['Name', 'Email', 'Team']} rows={3} cellWidths={['60%', '80%', '40%']} />
      </section>
    </div>
  );
}

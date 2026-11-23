import type { PreviewMeta } from '@components/previewMeta';
import { Button } from '@components/Button/Button';
import { Spinner } from './Spinner';

export const meta: PreviewMeta = { group: 'Feedback', height: 180 };

export default function SpinnerPreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Sizes: 14, 16, 20, 24. It takes the text colour around it</p>
        <div className="ds-row">
          <Spinner size={14} />
          <Spinner label="Loading members" />
          <Spinner size={20} />
          <Spinner size={24} label="Loading analytics" />
          <span style={{ color: 'var(--gt-primary)' }}><Spinner size={24} /></span>
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">An action in flight: a busy button, a "Loading more" row</p>
        <div className="ds-row">
          <Button loading loadingLabel="Saving…">Save</Button>
          <span className="ds-row" style={{ gap: 8, color: 'var(--gt-text-secondary)' }}>
            <Spinner size={16} decorative />
            Loading more…
          </span>
        </div>
      </section>
    </div>
  );
}

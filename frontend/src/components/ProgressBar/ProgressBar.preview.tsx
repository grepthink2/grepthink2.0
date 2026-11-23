import type { PreviewMeta } from '@components/previewMeta';
import { ProgressBar } from './ProgressBar';

export const meta: PreviewMeta = { group: 'Display', height: 540 };

export default function ProgressBarPreview() {
  return (
    <div className="ds-stack">
      <ProgressBar value={68} label="Sprint 3" showLabel valueText="17 of 25 points" />
      <ProgressBar value={25} label="Contribution" meter showLabel tone="blue" />
      <section className="ds-section">
        <p className="ds-caption">Tones: primary, blue, warning, error</p>
        <ProgressBar value={80} label="Tasks done" />
        <ProgressBar value={55} label="Sprint goals" tone="blue" />
        <ProgressBar value={35} label="Time left" tone="warning" />
        <ProgressBar value={90} label="Over budget" tone="error" />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Sizes: sm 4, md 8, lg 12</p>
        <ProgressBar value={60} label="Small" size="sm" />
        <ProgressBar value={60} label="Medium" size="md" />
        <ProgressBar value={60} label="Large" size="lg" />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Inline, beside its own number (a table cell)</p>
        <span className="ds-row">
          5 / 8
          <ProgressBar inline decorative value={5} max={8} style={{ width: 120 }} />
        </span>
      </section>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Button } from '@components/Button/Button';
import { InfoPopover } from './InfoPopover';

export const meta: PreviewMeta = { group: 'Display', height: 290, expects: '[role="dialog"]' };

export default function InfoPopoverPreview() {
  const first = useRef<HTMLButtonElement>(null);
  // Opens the first one, as a click would, so the card shows the panel.
  useEffect(() => {
    first.current?.click();
  }, []);
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">What a figure counts</p>
        <span className="ds-row">
          TSRs submitted
          <InfoPopover
            ref={first}
            title="How TSRs are counted"
            label="About TSRs submitted"
            body="Submitted reports this sprint, out of everyone enrolled. Late submissions count."
          />
        </span>
      </section>
      <section className="ds-section" style={{ marginTop: 120 }}>
        <p className="ds-caption">Why a control is disabled</p>
        <span className="ds-row">
          <Button disabled>Publish</Button>
          <InfoPopover title="Why can't I publish?" body="Add at least one question first." />
        </span>
      </section>
    </div>
  );
}

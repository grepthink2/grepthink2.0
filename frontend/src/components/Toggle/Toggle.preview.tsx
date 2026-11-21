import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Toggle } from './Toggle';

export const meta: PreviewMeta = { group: 'Primitives', height: 220 };

export default function TogglePreview() {
  const [dueReminder, setDueReminder] = useState(true);
  const [digest, setDigest] = useState(false);
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">On and off (click them)</p>
        <Toggle
          label="Email me when a TSR is due"
          description="Sent the day before, at 9 AM."
          checked={dueReminder}
          onChange={(e) => setDueReminder(e.target.checked)}
        />
        <Toggle label="Weekly digest" checked={digest} onChange={(e) => setDigest(e.target.checked)} />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Disabled</p>
        <Toggle label="Message notifications" description="Your school turned these off." disabled />
      </section>
    </div>
  );
}

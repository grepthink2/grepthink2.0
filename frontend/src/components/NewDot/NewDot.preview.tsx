import { Info } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { Avatar } from '@components/Avatar/Avatar';
import { NewDot } from './NewDot';

export const meta: PreviewMeta = { group: 'Display', height: 90 };

// The host positions the dot; the dot has no offset of its own.
const corner = { position: 'absolute', top: -1, right: -1 } as const;

export default function NewDotPreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">On its own, and ringed over an avatar or an icon's corner</p>
        <div className="ds-row">
          <NewDot />
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Avatar name="Maya Chen" size="sm" decorative />
            <NewDot ring style={corner} />
          </span>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <Info size={18} aria-hidden="true" />
            <NewDot ring style={corner} />
          </span>
        </div>
      </section>
    </div>
  );
}

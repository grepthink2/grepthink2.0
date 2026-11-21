import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { FieldShell } from './FieldShell';

export const meta: PreviewMeta = { group: 'Primitives', height: 130 };

export default function FieldShellPreview() {
  const [name, setName] = useState('M');
  return (
    <div className="ds-grid">
      <FieldShell label="Team logo" optional helperText="PNG or JPG, up to 2 MB.">
        {({ id, describedBy, invalid }) => (
          <input id={id} type="file" accept="image/png, image/jpeg" aria-describedby={describedBy} aria-invalid={invalid || undefined} />
        )}
      </FieldShell>
      <FieldShell label="Display name" error={name.length < 2 ? 'Use at least two characters.' : undefined} count={name.length} max={40}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            className="gt-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </FieldShell>
    </div>
  );
}

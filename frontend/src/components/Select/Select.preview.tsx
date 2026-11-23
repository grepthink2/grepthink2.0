import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Select } from './Select';

export const meta: PreviewMeta = { group: 'Primitives', height: 210 };

const DURATIONS = [
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
];

export default function SelectPreview() {
  const [duration, setDuration] = useState('30');
  const [sprint, setSprint] = useState('s3');
  return (
    <div className="ds-grid">
      <Select label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)} options={DURATIONS} />
      <Select
        label="Sprint"
        compact
        value={sprint}
        onChange={(e) => setSprint(e.target.value)}
        options={[
          { label: 'Current', options: [{ value: 's3', label: 'Sprint 3' }] },
          { label: 'Past', options: [{ value: 's2', label: 'Sprint 2' }, { value: 's1', label: 'Sprint 1' }] },
        ]}
      />
      <Select label="Role" placeholder="Choose a role" options={[{ value: 'ta', label: 'TA' }, { value: 'student', label: 'Student' }]} />
      <Select label="Term" options={[{ value: 'f26', label: 'Fall 2026' }]} error="Pick the term this class runs in." />
    </div>
  );
}

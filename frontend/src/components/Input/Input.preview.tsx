import { useState } from 'react';
import { Search } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { Input } from './Input';

export const meta: PreviewMeta = { group: 'Primitives', height: 390 };

export default function InputPreview() {
  const [name, setName] = useState('Bike Share Map');
  const [linkedIn, setLinkedIn] = useState('maya-chen');
  return (
    <div className="ds-stack">
      <div className="ds-grid">
        <Input
          label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          helperText="Your team and your TA see it."
          maxLength={40}
          showCount
        />
        <Input label="LinkedIn" optional prefixText="linkedin.com/in/" value={linkedIn} onChange={(e) => setLinkedIn(e.target.value)} />
        <Input label="Hours this week" type="number" defaultValue="6" suffix="hrs" />
        <Input label="Meeting title" defaultValue="" error="Give the meeting a title." />
        <Input label="School email" defaultValue="maya.chen@example.edu" disabled />
      </div>
      <section className="ds-section">
        <p className="ds-caption">Compact, with an icon and a hidden label: a toolbar filter</p>
        <div className="ds-grid">
          <Input label="Search members" hideLabel compact iconLeft={<Search size={15} />} placeholder="Search members…" />
        </div>
      </section>
    </div>
  );
}

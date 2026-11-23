import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { RadioGroup } from './RadioGroup';

export const meta: PreviewMeta = { group: 'Primitives', height: 390 };

export default function RadioGroupPreview() {
  const [visibility, setVisibility] = useState('open');
  const [status, setStatus] = useState('draft');
  const [length, setLength] = useState('30');
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">List (the default)</p>
        <RadioGroup
          legend="Project visibility"
          value={visibility}
          onChange={setVisibility}
          options={[
            { value: 'open', label: 'Open', description: 'Anyone in the class can ask to join.' },
            { value: 'invite', label: 'Invite only' },
          ]}
        />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Inline, with a disabled option</p>
        <RadioGroup
          legend="Meeting length"
          inline
          value={length}
          onChange={setLength}
          options={[
            { value: '15', label: '15 min' },
            { value: '30', label: '30 min' },
            { value: '60', label: '60 min', disabled: true },
          ]}
        />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Cards</p>
        <RadioGroup
          variant="card"
          legend="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'draft', label: 'Draft', description: 'Only staff can see it.' },
            { value: 'published', label: 'Published', description: 'Students see it on their home page.' },
          ]}
        />
      </section>
    </div>
  );
}

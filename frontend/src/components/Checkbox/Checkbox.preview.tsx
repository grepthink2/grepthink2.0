import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Checkbox } from './Checkbox';

export const meta: PreviewMeta = { group: 'Primitives', height: 320 };

const MEMBERS = ['Maya Chen', 'Leo Park', 'Ines Ruiz'];

export default function CheckboxPreview() {
  const [notify, setNotify] = useState(true);
  const [picked, setPicked] = useState(['Maya Chen']);
  const all = picked.length === MEMBERS.length;
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">With a description</p>
        <Checkbox
          label="Notify my team"
          description="Members get an email when this posts."
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Select all: indeterminate while part of the list is chosen</p>
        <Checkbox
          label="Select all"
          checked={all}
          indeterminate={picked.length > 0 && !all}
          onChange={() => setPicked(all ? [] : MEMBERS)}
        />
        {MEMBERS.map((name) => (
          <Checkbox
            key={name}
            label={name}
            checked={picked.includes(name)}
            onChange={(e) => setPicked(e.target.checked ? [...picked, name] : picked.filter((p) => p !== name))}
          />
        ))}
      </section>
      <section className="ds-section">
        <p className="ds-caption">Disabled</p>
        <Checkbox label="Share with other teams" disabled />
      </section>
    </div>
  );
}

import { useState } from 'react';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { Button } from './Button';

export const meta: PreviewMeta = { group: 'Primitives', height: 400 };

export default function ButtonPreview() {
  const [showTable, setShowTable] = useState(true);
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Variants: one primary per view</p>
        <div className="ds-row">
          <Button>Save changes</Button>
          <Button variant="secondary">Preview</Button>
          <Button variant="outline">Cancel</Button>
          <Button variant="ghost">View all</Button>
          <Button variant="danger">Delete project</Button>
          <Button variant="danger-ghost" size="sm" iconLeft={<Trash2 size={14} />}>Remove</Button>
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Sizes: sm in rows and toolbars, md in forms, lg on sign-in pages</p>
        <div className="ds-row">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">States: busy, disabled, pressed (click it)</p>
        <div className="ds-row">
          <Button loading loadingLabel="Saving…">Save changes</Button>
          <Button disabled>Submit</Button>
          <Button variant="outline" size="sm" pressed={showTable} onClick={() => setShowTable(!showTable)}>Table</Button>
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">With an icon</p>
        <div className="ds-row">
          <Button iconLeft={<Plus size={16} />}>New project</Button>
          <Button variant="outline" iconRight={<ArrowRight size={16} />}>Next</Button>
        </div>
      </section>
    </div>
  );
}

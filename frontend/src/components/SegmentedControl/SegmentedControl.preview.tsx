import { useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { SegmentedControl } from './SegmentedControl';

export const meta: PreviewMeta = { group: 'Navigation', height: 260 };

export default function SegmentedControlPreview() {
  const [view, setView] = useState('table');
  const [unit, setUnit] = useState('tasks');
  const [scope, setScope] = useState('all');
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">The view of the same content, with icons</p>
        <div className="ds-row">
          <SegmentedControl
            ariaLabel="View"
            value={view}
            onChange={setView}
            options={[
              { value: 'table', label: 'Table', icon: <List size={14} /> },
              { value: 'cards', label: 'Cards', icon: <LayoutGrid size={14} /> },
            ]}
          />
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Small, for a unit</p>
        <div className="ds-row">
          <SegmentedControl ariaLabel="Unit" size="sm" value={unit} onChange={setUnit} options={[{ value: 'tasks', label: 'Tasks' }, { value: 'points', label: 'Points' }]} />
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Full width, with counts</p>
        <SegmentedControl
          ariaLabel="Search in"
          fullWidth
          value={scope}
          onChange={setScope}
          options={[
            { value: 'all', label: 'All', count: 24 },
            { value: 'people', label: 'People', count: 9 },
            { value: 'projects', label: 'Projects', count: 15 },
          ]}
        />
      </section>
    </div>
  );
}

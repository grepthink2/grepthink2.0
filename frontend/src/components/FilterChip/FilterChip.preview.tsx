import { useState } from 'react';
import { Star } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { FilterChip } from './FilterChip';
import { FilterChipGroup } from './FilterChipGroup';

export const meta: PreviewMeta = { group: 'Navigation', height: 240 };

export default function FilterChipPreview() {
  const [range, setRange] = useState('30d');
  const [kinds, setKinds] = useState(['ta']);
  const [starred, setStarred] = useState(true);
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">One choice: a radio group (the arrow keys move and select)</p>
        <FilterChipGroup
          type="single"
          ariaLabel="Date range"
          value={range}
          onChange={setRange}
          options={[{ value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'term', label: 'This term' }]}
        />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Several choices: toggles with a check, small, with counts</p>
        <FilterChipGroup
          ariaLabel="Kinds"
          size="sm"
          value={kinds}
          onChange={setKinds}
          options={[
            { value: 'ta', label: 'TA meetings', count: 3 },
            { value: 'team', label: 'Team meetings', count: 1 },
            { value: 'review', label: 'Final reviews', disabled: true, title: 'Select a class first' },
          ]}
        />
      </section>
      <section className="ds-section">
        <p className="ds-caption">A chip on its own</p>
        <div className="ds-row">
          <FilterChip selected={starred} icon={<Star size={14} />} onClick={() => setStarred(!starred)}>Starred</FilterChip>
        </div>
      </section>
    </div>
  );
}

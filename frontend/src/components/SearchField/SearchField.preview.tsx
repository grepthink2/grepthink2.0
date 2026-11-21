import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { SearchField } from './SearchField';

export const meta: PreviewMeta = { group: 'Primitives', height: 170 };

export default function SearchFieldPreview() {
  const [query, setQuery] = useState('chen');
  const [projects, setProjects] = useState('');
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">With a query: the × clears it</p>
        <SearchField label="Search classmates" placeholder="Search by name or email…" value={query} onChange={setQuery} />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Compact, in a toolbar</p>
        <SearchField label="Search projects" compact value={projects} onChange={setProjects} />
      </section>
    </div>
  );
}

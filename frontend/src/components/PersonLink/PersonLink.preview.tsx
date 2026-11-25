import type { PreviewMeta } from '@components/previewMeta';
import { PersonHoverCard } from './PersonHoverCard';
import { PersonLink } from './PersonLink';

export const meta: PreviewMeta = { group: 'Display', height: 380 };

const maya = { id: 'maya', name: 'Maya Chen' };
const lines = { roleLine: 'Student · CSE 115A', teamLine: 'Trailhead · Product Owner' };

export default function PersonLinkPreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Plain, for a cell, a row or a heading: underlined on hover and focus</p>
        <div className="ds-row">
          <PersonLink person={maya} />
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Inline, inside a sentence: a quiet underline at rest</p>
        <p style={{ margin: 0 }}>
          Saved Nov 18 at 9:42 PM by <PersonLink person={maya} variant="inline" />
        </p>
      </section>
      <section className="ds-section">
        <p className="ds-caption">With a card: rest a mouse pointer on the name</p>
        <div className="ds-row">
          <PersonLink person={maya} card={lines} />
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">PersonHoverCard, the card on its own</p>
        <div style={{ width: 280 }}>
          <PersonHoverCard person={maya} roleLine="Student · CSE 115A" teamLine="Trailhead · Product Owner" />
        </div>
      </section>
    </div>
  );
}

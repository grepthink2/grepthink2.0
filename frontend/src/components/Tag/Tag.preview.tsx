import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Tag } from './Tag';

export const meta: PreviewMeta = { group: 'Display', height: 150 };

export default function TagPreview() {
  const [skills, setSkills] = useState(['React', 'TypeScript', 'SQL', 'Figma']);
  const drop = (skill: string) => setSkills(skills.filter((s) => s !== skill));
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Tones: neutral, green, blue</p>
        <div className="ds-row">
          <Tag>React</Tag>
          <Tag tone="green">Frontend</Tag>
          <Tag tone="blue">Sprint 3</Tag>
          <Tag style={{ maxWidth: 160 }}>A long label that runs out of room</Tag>
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Removable (press ×)</p>
        <div className="ds-row">
          {skills.map((skill) => (
            <Tag key={skill} tone="green" onRemove={() => drop(skill)} removeLabel={`Remove ${skill}`}>{skill}</Tag>
          ))}
        </div>
      </section>
    </div>
  );
}

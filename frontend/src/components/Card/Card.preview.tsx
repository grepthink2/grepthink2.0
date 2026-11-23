import { useState } from 'react';
import { Settings } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { Badge } from '@components/Badge/Badge';
import { Button } from '@components/Button/Button';
import { IconButton } from '@components/IconButton/IconButton';
import { Card } from './Card';

export const meta: PreviewMeta = { group: 'Display', height: 700 };

const CLASSES = [
  { id: 'cse115a', code: 'CSE 115A', term: 'Fall 2026', students: 42 },
  { id: 'cse115b', code: 'CSE 115B', term: 'Winter 2027', students: 38 },
];

export default function CardPreview() {
  const [picked, setPicked] = useState('cse115a');
  return (
    <div className="ds-stack">
      <div className="ds-grid">
        <Card
          title="Team"
          subtitle="2 members"
          actions={<IconButton ariaLabel="Manage team" size="sm"><Settings size={16} /></IconButton>}
          footer={<Button variant="ghost" size="sm">View all</Button>}
        >
          <div className="ds-stack" style={{ gap: 8 }}>
            <Card bordered title="Maya Chen" subtitle="Product Owner">maya.chen@example.edu</Card>
            <Card bordered title="Leo Park" subtitle="Scrum Master">leo.park@example.edu</Card>
          </div>
        </Card>
        <Card shadow="hairline" title="Sprint 3" subtitle="Ends Friday">
          <Badge status="sprint.active" />
        </Card>
      </div>
      <section className="ds-section">
        <p className="ds-caption">A card that is a button: the whole card is the target (click one)</p>
        <div className="ds-grid">
          {CLASSES.map((c) => (
            <Card key={c.id} onClick={() => setPicked(c.id)} selected={c.id === picked} title={c.code} subtitle={c.term}>
              {c.students} students
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

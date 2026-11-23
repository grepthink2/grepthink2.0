import { BarChart3, FolderOpen } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { Button } from '@components/Button/Button';
import { Card } from '@components/Card/Card';
import { EmptyState, NoClassSelected } from './EmptyState';

export const meta: PreviewMeta = { group: 'Feedback', height: 990 };

const reload = () => {};
const openClassSelector = () => {};

export default function EmptyStatePreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">page (the default): a region with nothing in it yet</p>
        <EmptyState
          icon={<FolderOpen size={28} />}
          title="No projects yet"
          description="Projects your class creates appear here."
          action={<Button>Create project</Button>}
          titleAs="h2"
        />
      </section>
      <div className="ds-grid">
        <section className="ds-section">
          <p className="ds-caption">card: inside a card, a chart or a table</p>
          <Card title="Messages">
            <EmptyState variant="card" icon={<BarChart3 size={18} />} title="No messages in this range" />
          </Card>
        </section>
        <section className="ds-section">
          <p className="ds-caption">quiet, and error with Try again</p>
          <EmptyState variant="quiet" title="No upcoming meetings." />
          <EmptyState variant="error" title="Couldn't load team meetings." onRetry={reload} />
        </section>
      </div>
      <section className="ds-section">
        <p className="ds-caption">NoClassSelected: the one empty state for a page that needs a class</p>
        <NoClassSelected onSelectClass={openClassSelector} variant="card" titleAs="h3" />
      </section>
    </div>
  );
}

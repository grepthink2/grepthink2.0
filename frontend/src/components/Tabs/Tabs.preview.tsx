import { useState } from 'react';
import { CalendarDays, FileText, Users } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { TabPanel, Tabs } from './Tabs';

export const meta: PreviewMeta = { group: 'Navigation', height: 220 };

export default function TabsPreview() {
  const [tab, setTab] = useState('details');
  const [mode, setMode] = useState('write');
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Panels of different content (switch them)</p>
        <Tabs
          idBase="ep"
          ariaLabel="Edit project"
          value={tab}
          onChange={setTab}
          collapseOnPhone
          tabs={[
            { value: 'details', label: 'Details', icon: <FileText size={16} /> },
            { value: 'team', label: 'Team', icon: <Users size={16} />, count: 5 },
            { value: 'meetings', label: 'Meetings', icon: <CalendarDays size={16} /> },
          ]}
        />
        <TabPanel idBase="ep" value="details" active={tab === 'details'}>The project's name, description and repository.</TabPanel>
        <TabPanel idBase="ep" value="team" active={tab === 'team'}>Five members. The Product Owner edits meetings.</TabPanel>
        <TabPanel idBase="ep" value="meetings" active={tab === 'meetings'}>The weekly TA meeting and the team's own meetings.</TabPanel>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Small, for an editor bar</p>
        <div style={{ maxWidth: 240 }}>
          <Tabs
            size="sm"
            ariaLabel="Editor"
            value={mode}
            onChange={setMode}
            tabs={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]}
          />
        </div>
      </section>
    </div>
  );
}

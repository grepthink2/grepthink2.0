import { MessageSquare, Users } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { StatCard } from './StatCard';

export const meta: PreviewMeta = { group: 'Display', height: 400 };

const WEEKLY = [8200, 9100, 8800, 10400, 11000, 12900];

const open = () => {};

export default function StatCardPreview() {
  return (
    <div className="ds-grid">
      <StatCard
        label="Registered Students"
        value={62}
        hint="58 enrolled · 4 invited"
        icon={<Users size={16} />}
        info={{ body: 'Students registered in GrepThink' }}
      />
      <StatCard
        compact
        format="compact"
        label="Messages"
        value={12900}
        icon={<MessageSquare size={16} />}
        accent="blue"
        trend={WEEKLY}
        delta={{ value: 0.18, vsLabel: 'vs the 7 days before' }}
      />
      <StatCard label="Students" value={null} hint="Appears once the roster is imported" />
      <StatCard label="TSRs submitted" value={0.82} format="percent" accent="purple" onClick={open} />
      <StatCard label="Meetings held" value={null} failed />
      <StatCard label="Open tasks" value={null} loading />
    </div>
  );
}

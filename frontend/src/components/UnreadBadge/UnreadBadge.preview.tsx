import { Bell } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { IconButton } from '@components/IconButton/IconButton';
import { UnreadBadge } from './UnreadBadge';

export const meta: PreviewMeta = { group: 'Display', height: 100 };

export default function UnreadBadgePreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Unread counts are always red; past 99 they read 99+; the dot is for a collapsed sidebar</p>
        <div className="ds-row">
          <span className="ds-row">Messages <UnreadBadge count={3} /></span>
          <span className="ds-row">Team channel <UnreadBadge count={128} /></span>
          <span className="ds-row">Inbox <UnreadBadge count={4} dot /></span>
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <IconButton ariaLabel="Notifications, 8 unread"><Bell size={18} /></IconButton>
            <UnreadBadge count={8} style={{ position: 'absolute', top: -4, right: -6 }} />
          </span>
        </div>
      </section>
    </div>
  );
}

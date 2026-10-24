import React from 'react';
import { Modal } from '../feedback/Modal.jsx';
import { ReleaseFeed } from './ReleaseFeed.jsx';

/**
 * What's new (2026-10-23) — the release notes in the kit's Modal: the title "What's new", the subtitle
 * "Version 0.91.0" (the visitor's version), the kit's × ("Close"), the feed scrolling inside the body, no footer.
 * `tone="dark"` on the landing page, the kit's light look in the app; `md` (560px) and the kit's phone layout.
 * The dialog behaviour is Modal's: focus moves to the sheet (there is no field) and stays trapped, Esc / the
 * scrim / the × close it, focus returns to the opener — the landing tab, or in the app the profile button.
 * Opening marks the version seen; pass the `lastSeen` the modal opened with so its "New" markers stay put.
 */
export function WhatsNewModal({
  open = false, onClose, tone = 'light', releases = [], currentVersion, lastSeen = null, status = 'ready', onReload,
  portal = true, className = '',
}) {
  return (
    <Modal open={open} onClose={onClose} tone={tone} size="md" title="What's new" subtitle={currentVersion ? `Version ${currentVersion}` : undefined}
      portal={portal} className={['gt-whats-new', className].filter(Boolean).join(' ')}>
      <ReleaseFeed releases={releases} lastSeen={lastSeen} status={status} onReload={onReload} tone={tone} />
    </Modal>
  );
}

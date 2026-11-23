import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { ConfirmDialog, InlineConfirm } from './ConfirmDialog';

export const meta: PreviewMeta = { group: 'Feedback', height: 400, expects: '[role="alertdialog"]' };

// Fails after a moment, so pressing Delete shows the busy state and then the error.
const failSoon = () => new Promise((_, reject) => window.setTimeout(() => reject(new Error('offline')), 900));
const cancel = () => {};

export default function ConfirmDialogPreview() {
  const [rowBusy, setRowBusy] = useState(false);
  return (
    <div className="ds-stack">
      <ConfirmDialog
        open
        portal={false}
        destructive
        title="Delete Sprint 3 planning?"
        message="It disappears from your team's calendars."
        confirmLabel="Delete"
        busyLabel="Deleting…"
        onConfirm={failSoon}
        onCancel={cancel}
      />
      <section className="ds-section">
        <p className="ds-caption">InlineConfirm: a row-level delete inside a dialog</p>
        <InlineConfirm
          autoFocus={false}
          message="Delete 'Sprint 3 planning'? It disappears from your team's calendars."
          busy={rowBusy}
          onConfirm={() => setRowBusy(true)}
          onCancel={() => setRowBusy(false)}
        />
      </section>
    </div>
  );
}

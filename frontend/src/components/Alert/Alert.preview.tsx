import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Button } from '@components/Button/Button';
import { Alert } from './Alert';

export const meta: PreviewMeta = { group: 'Feedback', height: 350 };

const retry = () => {};

export default function AlertPreview() {
  const [showPreview, setShowPreview] = useState(true);
  return (
    <div className="ds-stack" style={{ gap: 12 }}>
      {showPreview && (
        <Alert tone="info" title="You're viewing this class as a student" onDismiss={() => setShowPreview(false)}>
          Nothing you do here is saved.
        </Alert>
      )}
      <Alert tone="success">Your TSR was submitted. Your TA sees it now.</Alert>
      <Alert tone="warning" title="The late window closes Friday">
        Reports submitted after the deadline are marked late.
      </Alert>
      <Alert
        tone="error"
        title="Couldn't save your changes"
        actions={<Button size="sm" variant="outline" onClick={retry}>Try again</Button>}
      >
        Check your connection; your edits are still here.
      </Alert>
    </div>
  );
}

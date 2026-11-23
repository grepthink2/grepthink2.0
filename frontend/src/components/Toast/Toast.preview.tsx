import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Button } from '@components/Button/Button';
import { Toast, ToastStack } from './Toast';
import { useToasts } from './useToasts';

export const meta: PreviewMeta = { group: 'Feedback', height: 300, expects: '.gt-toast[role="status"]' };

const undo = () => {};

export default function ToastPreview() {
  const [shown, setShown] = useState(['saved', 'moved', 'info']);
  const hide = (key: string) => setShown(shown.filter((k) => k !== key));
  const { toasts, push, dismiss } = useToasts();
  return (
    <div className="ds-stack" style={{ maxWidth: 420, gap: 12 }}>
      {shown.includes('saved') && <Toast variant="success" message="Repository saved" duration={0} onDismiss={() => hide('saved')} />}
      {shown.includes('moved') && (
        <Toast
          variant="error"
          message="Couldn't move GT-12; it dropped back to To do."
          actionLabel="Undo"
          onAction={undo}
          onDismiss={() => hide('moved')}
        />
      )}
      {shown.includes('info') && <Toast variant="info" message="Sign-ups for final reviews open Monday." duration={0} onDismiss={() => hide('info')} />}
      <div className="ds-row">
        <Button variant="outline" size="sm" onClick={() => push('success', 'Meeting scheduled')}>Show a toast</Button>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

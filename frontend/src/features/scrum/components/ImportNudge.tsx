import { useState } from 'react';
import { Alert } from '@components/Alert/Alert';
import { Button } from '@components/Button/Button';
import { Textarea } from '@components/Textarea/Textarea';
import { MOVE_IN_PROMPT } from '@features/connector/prompts';
import './ImportNudge.scss';

const storageKey = (projectId: string) => `gt.scrum.importNudgeDismissed.${projectId}`;

/** Storage that is blocked or full reads as not dismissed, and a dismissal then lasts until a reload. */
function readDismissed(projectId: string): boolean {
  try {
    return localStorage.getItem(storageKey(projectId)) !== null;
  } catch {
    return false;
  }
}

function writeDismissed(projectId: string): void {
  try {
    localStorage.setItem(storageKey(projectId), '1');
  } catch {
    // the page's own state hides the notice for now
  }
}

/**
 * Invites a team that already runs sprints elsewhere to bring its board in through the connector
 * (backend `app/mcp`). The page decides when it applies. Dismissed per browser and per project, so
 * the page keys it by project.
 */
export default function ImportNudge({ projectId, onConnect }: { projectId: string; onConnect: () => void }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(projectId));
  const [copy, setCopy] = useState<'idle' | 'copied' | 'refused'>('idle');

  if (dismissed) return null;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MOVE_IN_PROMPT);
      setCopy('copied');
    } catch {
      setCopy('refused');
    }
  };

  return (
    <Alert
      title="Already running sprints somewhere else?"
      onDismiss={() => {
        writeDismissed(projectId);
        setDismissed(true);
      }}
      actions={(
        <>
          <Button size="sm" variant="outline" onClick={onConnect}>Connect your assistant</Button>
          <Button size="sm" variant="outline" onClick={copyPrompt}>
            {copy === 'copied' ? 'Copied' : 'Copy the prompt'}
          </Button>
        </>
      )}
    >
      <p>
        Your AI assistant can move your team&apos;s board in, finished work included, and your burnup charts
        count that work on the days it was done. It shows you the plan first and adds nothing until you say yes.
        Move in before your team adds more than 3 stories by hand, or finished work can&apos;t come across.
      </p>
      {copy === 'refused' && (
        <div className="import-nudge__prompt">
          <Textarea label="Copy this prompt into your assistant" value={MOVE_IN_PROMPT} rows={12} readOnly />
        </div>
      )}
    </Alert>
  );
}

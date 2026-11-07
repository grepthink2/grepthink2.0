import { useState } from 'react';
import { Alert } from '@components/Alert/Alert';
import { Button } from '@components/Button/Button';
import { Textarea } from '@components/Textarea/Textarea';
import { MOVE_IN_BODY, MOVE_IN_PROMPT, MOVE_IN_TITLE } from '@features/connector/prompts';
import { useCopyMoveInPrompt } from '@features/connector/useCopyMoveInPrompt';
import './ImportNudge.scss';

const storageKey = (projectId: string) => `gt.scrum.importNudgeDismissed.${projectId}`;

/** This page's own record of a dismissal; it resets on reload. The notice unmounts on every board load. */
const dismissedHere = new Set<string>();

/** Storage that is blocked or full reads as not dismissed, so a dismissal it refused lasts until a reload. */
function readDismissed(projectId: string): boolean {
  if (dismissedHere.has(projectId)) return true;
  try {
    return localStorage.getItem(storageKey(projectId)) !== null;
  } catch {
    return false;
  }
}

function writeDismissed(projectId: string): void {
  dismissedHere.add(projectId);
  try {
    localStorage.setItem(storageKey(projectId), '1');
  } catch {
    // blocked or full: dismissedHere carries it for the rest of this page's life
  }
}

/**
 * Invites a team that already runs sprints elsewhere to bring its board in through the connector
 * (backend `app/mcp`). The page decides when it applies. Dismissed per browser and per project, so
 * the page keys it by project.
 */
export default function ImportNudge({ projectId, onConnect }: { projectId: string; onConnect: () => void }) {
  const [dismissed, setDismissed] = useState(() => readDismissed(projectId));
  const { copy, copyPrompt } = useCopyMoveInPrompt();

  if (dismissed) return null;

  return (
    <Alert
      title={MOVE_IN_TITLE}
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
      <p>{MOVE_IN_BODY}</p>
      {copy === 'refused' && (
        <div className="import-nudge__prompt">
          <Textarea label="Copy this prompt into your assistant" value={MOVE_IN_PROMPT} rows={12} readOnly />
        </div>
      )}
    </Alert>
  );
}

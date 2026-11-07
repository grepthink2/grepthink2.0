import { useRef } from 'react';
import { Button } from '@components/Button/Button';
import { Modal } from '@components/Modal/Modal';
import { Textarea } from '@components/Textarea/Textarea';
import { MOVE_IN_BODY, MOVE_IN_PROMPT, MOVE_IN_TITLE } from '../prompts';
import { useCopyMoveInPrompt } from '../useCopyMoveInPrompt';
import ConnectorSetup from './ConnectorSetup';
import './MoveInModal.scss';

export interface MoveInModalProps {
  open: boolean;
  onClose: () => void;
  /** The team being invited, shown under the title. */
  teamName?: string;
  /** The connector's address. */
  connectorAddress: string;
}

/**
 * The student Home's invitation to move the team's board in through the connector (backend
 * `app/mcp`): the board notice's words, then the two steps. MoveInInvite decides when it opens.
 * Focus starts on the body, as in What's new, so an Enter pressed as it opens copies nothing.
 */
export default function MoveInModal({ open, onClose, teamName, connectorAddress }: MoveInModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const { copy, copyPrompt } = useCopyMoveInPrompt();

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={MOVE_IN_TITLE}
      subtitle={teamName}
      className="move-in-modal"
      bodyLabel="Move your board in"
      bodyRef={bodyRef}
      initialFocusRef={bodyRef}
    >
      <p className="move-in-modal__lead">{MOVE_IN_BODY}</p>
      <ol className="move-in-modal__steps">
        <li>
          <p className="move-in-modal__step">Add GrepThink to your assistant</p>
          <ConnectorSetup url={connectorAddress} />
        </li>
        <li>
          <p className="move-in-modal__step">Paste this prompt into a chat</p>
          <Button size="sm" variant="outline" onClick={copyPrompt}>
            {copy === 'copied' ? 'Copied' : 'Copy the prompt'}
          </Button>
          {copy === 'refused' && (
            <div className="move-in-modal__prompt">
              <Textarea label="Copy this prompt into your assistant" value={MOVE_IN_PROMPT} rows={12} readOnly />
            </div>
          )}
        </li>
      </ol>
    </Modal>
  );
}

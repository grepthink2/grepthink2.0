import { Button } from '@components/Button/Button';
import { Textarea } from '@components/Textarea/Textarea';
import { useCopyMoveInPrompt } from '../hooks/useCopyMoveInPrompt';
import { MOVE_IN_PROMPT } from '../prompts';
import './MoveInPromptNote.scss';

/** A short note with the move-in prompt to copy, under the connector's steps in the board's ⓘ popover. */
export default function MoveInPromptNote() {
  const { copy, copyPrompt } = useCopyMoveInPrompt();

  return (
    <div className="move-in-prompt-note">
      <p className="move-in-prompt-note__text">
        Moving in a board you already run? Copy the move-in prompt into the chat. Finished work comes across until
        your team adds more than 3 stories by hand.
      </p>
      <Button size="sm" variant="outline" onClick={copyPrompt}>
        {copy === 'copied' ? 'Copied' : 'Copy the prompt'}
      </Button>
      {copy === 'refused' && (
        <div className="move-in-prompt-note__prompt">
          <Textarea label="Copy this prompt into your assistant" value={MOVE_IN_PROMPT} rows={8} readOnly />
        </div>
      )}
    </div>
  );
}

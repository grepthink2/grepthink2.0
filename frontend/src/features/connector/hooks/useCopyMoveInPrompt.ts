import { useState } from 'react';
import { MOVE_IN_PROMPT } from '../prompts';

export type PromptCopy = 'idle' | 'copied' | 'refused';

/**
 * Copies the move-in prompt to the clipboard. `refused` means the clipboard was blocked, and the
 * caller then shows the prompt to copy by hand.
 */
export function useCopyMoveInPrompt(): { copy: PromptCopy; copyPrompt: () => Promise<void> } {
  const [copy, setCopy] = useState<PromptCopy>('idle');

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MOVE_IN_PROMPT);
      setCopy('copied');
    } catch {
      setCopy('refused');
    }
  };

  return { copy, copyPrompt };
}

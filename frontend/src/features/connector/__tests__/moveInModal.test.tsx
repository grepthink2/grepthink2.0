import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoveInModal from '../components/MoveInModal';
import { MOVE_IN_BODY, MOVE_IN_PROMPT, MOVE_IN_TITLE } from '../prompts';

afterEach(() => vi.restoreAllMocks());

const renderModal = (onClose = vi.fn()) =>
  render(<MoveInModal open onClose={onClose} teamName="Team One" />);

describe('MoveInModal', () => {
  it('shows the invitation, the team and the connector address', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: MOVE_IN_TITLE });
    expect(dialog).toHaveTextContent('Team One');
    expect(dialog).toHaveTextContent(MOVE_IN_BODY);
    expect(screen.getByText(/\/mcp$/)).toBeInTheDocument();
    expect(screen.getByText('Add GrepThink to your assistant')).toBeInTheDocument();
    expect(screen.getByText('Paste this prompt into a chat')).toBeInTheDocument();
  });

  it('copies the prompt', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Copy the prompt' }));

    expect(writeText).toHaveBeenCalledWith(MOVE_IN_PROMPT);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the prompt to copy by hand when the clipboard refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    renderModal();

    await user.click(screen.getByRole('button', { name: 'Copy the prompt' }));

    expect(await screen.findByRole('textbox', { name: 'Copy this prompt into your assistant' })).toHaveValue(
      MOVE_IN_PROMPT,
    );
  });

  it('closes on the ×', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal(onClose);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

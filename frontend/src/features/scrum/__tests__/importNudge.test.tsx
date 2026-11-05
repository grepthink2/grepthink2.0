import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MOVE_IN_PROMPT } from '@features/connector/prompts';
import ImportNudge from '../components/ImportNudge';

const TITLE = 'Already running sprints somewhere else?';

const blockStorage = (method: 'getItem' | 'setItem') =>
  vi.spyOn(Storage.prototype, method).mockImplementation(() => {
    throw new Error('blocked');
  });

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('ImportNudge', () => {
  it('stays dismissed on this project, and only this one', async () => {
    const user = userEvent.setup();
    const first = render(<ImportNudge projectId="p1" onConnect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    first.unmount();

    const again = render(<ImportNudge projectId="p1" onConnect={vi.fn()} />);
    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
    again.unmount();

    render(<ImportNudge projectId="p2" onConnect={vi.fn()} />);
    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it('shows when storage cannot be read', () => {
    blockStorage('getItem');
    render(<ImportNudge projectId="p1" onConnect={vi.fn()} />);

    expect(screen.getByText(TITLE)).toBeInTheDocument();
  });

  it('still closes when storage refuses the dismissal', async () => {
    const user = userEvent.setup();
    blockStorage('setItem');
    render(<ImportNudge projectId="p1" onConnect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByText(TITLE)).not.toBeInTheDocument();
  });

  it('copies the prompt', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ImportNudge projectId="p1" onConnect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Copy the prompt' }));

    expect(writeText).toHaveBeenCalledWith(MOVE_IN_PROMPT);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows the prompt to copy by hand when the clipboard refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<ImportNudge projectId="p1" onConnect={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Copy the prompt' }));

    expect(await screen.findByRole('textbox', { name: 'Copy this prompt into your assistant' })).toHaveValue(MOVE_IN_PROMPT);
  });

  it('asks for what the import needs', () => {
    expect(MOVE_IN_PROMPT).toMatch(/sprints, stories and tasks/);
    expect(MOVE_IN_PROMPT).toMatch(/status/);
    expect(MOVE_IN_PROMPT).toMatch(/the day it was done/);
    expect(MOVE_IN_PROMPT).toMatch(/one story with at least one task/);
    expect(MOVE_IN_PROMPT).toMatch(/add nothing until I say yes/);
  });
});

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOVE_IN_PROMPT } from '@features/connector/prompts';
import ConnectAssistant from '../components/ConnectAssistant';
import { connectorUrl } from '../utils/connectorUrl';

const ADDRESS = 'https://api.grepthink2.com/mcp';
const TRIGGER = 'Connect an AI assistant';

/** Whether the ⓘ is pulsing: ConnectAssistant marks the trigger's wrapper while it does. */
const pulsing = () =>
  screen.getByRole('button', { name: TRIGGER }).closest('.connect-assistant-trigger--pulse') !== null;

afterEach(() => vi.restoreAllMocks());

describe('ConnectAssistant', () => {
  it('builds the connector address from the API base', () => {
    expect(connectorUrl('https://api.grepthink2.com', 'https://grepthink2.com')).toBe('https://api.grepthink2.com/mcp');
    expect(connectorUrl('', 'http://localhost:5173')).toBe('http://localhost:5173/mcp');
  });

  it('shows the address and how to add it, and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ConnectAssistant url={ADDRESS} />);

    await user.click(screen.getByRole('button', { name: TRIGGER }));

    expect(screen.getByText(ADDRESS)).toBeInTheDocument();
    expect(screen.getByText(/Claude/)).toBeInTheDocument();
    expect(screen.getByText(/ChatGPT/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('copies the move-in prompt from a note under the steps', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ConnectAssistant url={ADDRESS} />);

    await user.click(screen.getByRole('button', { name: TRIGGER }));
    expect(screen.getByText(/Moving in a board you already run\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy the prompt' }));

    expect(writeText).toHaveBeenCalledWith(MOVE_IN_PROMPT);
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows the move-in prompt to copy by hand when the clipboard refuses', async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    render(<ConnectAssistant url={ADDRESS} />);

    await user.click(screen.getByRole('button', { name: TRIGGER }));
    await user.click(screen.getByRole('button', { name: 'Copy the prompt' }));

    expect(await screen.findByRole('textbox', { name: 'Copy this prompt into your assistant' })).toHaveValue(
      MOVE_IN_PROMPT,
    );
  });

  it('pulses until the ⓘ is clicked, and pulses again on the next board load', async () => {
    const user = userEvent.setup();
    const first = render(<ConnectAssistant url={ADDRESS} pulse />);
    expect(pulsing()).toBe(true);

    await user.click(screen.getByRole('button', { name: TRIGGER }));
    expect(pulsing()).toBe(false);
    await user.click(screen.getByRole('button', { name: TRIGGER })); // closing it doesn't bring the pulse back
    expect(pulsing()).toBe(false);
    first.unmount();

    render(<ConnectAssistant url={ADDRESS} pulse />);
    expect(pulsing()).toBe(true);
  });

  it('stops pulsing when another control opens it by clicking the ⓘ', () => {
    render(<ConnectAssistant url={ADDRESS} pulse />);

    act(() => screen.getByRole('button', { name: TRIGGER }).click());

    expect(pulsing()).toBe(false);
  });

  it("doesn't pulse unless asked to", () => {
    render(<ConnectAssistant url={ADDRESS} />);

    expect(pulsing()).toBe(false);
  });
});

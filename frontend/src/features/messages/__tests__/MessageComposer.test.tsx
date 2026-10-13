import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageComposer } from '../components/MessageComposer';

/** jsdom does no layout, so report 20px of content per line for the composer to measure. */
function measureLines(input: HTMLTextAreaElement) {
  Object.defineProperty(input, 'scrollHeight', {
    configurable: true,
    get: () => 20 * input.value.split('\n').length,
  });
}

describe('MessageComposer', () => {
  it('grows with the message and shrinks back once it is sent', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<MessageComposer onSend={onSend} />);
    const input = screen.getByPlaceholderText<HTMLTextAreaElement>('Send a message...');
    measureLines(input);

    fireEvent.change(input, { target: { value: 'one\ntwo\nthree' } });
    expect(input.style.height).toBe('60px');

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('one\ntwo\nthree'));
    await waitFor(() => expect(input.style.height).toBe('20px'));
  });
});

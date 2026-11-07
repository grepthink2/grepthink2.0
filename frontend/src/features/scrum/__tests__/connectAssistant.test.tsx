import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ConnectAssistant from '../components/ConnectAssistant';
import { connectorUrl } from '../utils/connectorUrl';

describe('ConnectAssistant', () => {
  it('builds the connector address from the API base', () => {
    expect(connectorUrl('https://api.grepthink2.com', 'https://grepthink2.com')).toBe('https://api.grepthink2.com/mcp');
    expect(connectorUrl('', 'http://localhost:5173')).toBe('http://localhost:5173/mcp');
  });

  it('shows the address and how to add it, and copies it', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    render(<ConnectAssistant url="https://api.grepthink2.com/mcp" />);

    await user.click(screen.getByRole('button', { name: 'Connect an AI assistant' }));

    expect(screen.getByText('https://api.grepthink2.com/mcp')).toBeInTheDocument();
    expect(screen.getByText(/Claude/)).toBeInTheDocument();
    expect(screen.getByText(/ChatGPT/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('https://api.grepthink2.com/mcp');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});

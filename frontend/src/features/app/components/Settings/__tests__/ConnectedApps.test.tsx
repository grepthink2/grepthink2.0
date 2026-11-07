import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getMcpConnections: vi.fn(), disconnectMcpConnection: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

import ConnectedApps from '../ConnectedApps';

const CLAUDE = {
  client_id: 'c1',
  app_name: 'Claude',
  connected_at: '2026-10-20T17:00:00Z',
  last_used_at: '2026-10-26T17:00:00Z',
};

beforeEach(() => vi.resetAllMocks());

describe('ConnectedApps', () => {
  it('lists the apps and disconnects one', async () => {
    api.getMcpConnections.mockResolvedValue({ connections: [CLAUDE] });
    api.disconnectMcpConnection.mockResolvedValue(undefined);
    render(<ConnectedApps />);

    const row = (await screen.findByText('Claude')).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Disconnect Claude' }));

    expect(api.disconnectMcpConnection).toHaveBeenCalledWith('c1');
    expect(await screen.findByText(/No apps are connected/)).toBeInTheDocument();
  });

  it('says when nothing is connected', async () => {
    api.getMcpConnections.mockResolvedValue({ connections: [] });

    render(<ConnectedApps />);

    expect(await screen.findByText(/No apps are connected/)).toBeInTheDocument();
  });

  it('keeps the app listed when disconnecting fails', async () => {
    api.getMcpConnections.mockResolvedValue({ connections: [CLAUDE] });
    api.disconnectMcpConnection.mockRejectedValue(new Error('500'));
    render(<ConnectedApps />);

    await userEvent.click(await screen.findByRole('button', { name: 'Disconnect Claude' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't disconnect Claude");
    expect(screen.getByText('Claude')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot load', async () => {
    api.getMcpConnections.mockRejectedValueOnce(new Error('500')).mockResolvedValue({ connections: [CLAUDE] });
    render(<ConnectedApps />);

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Claude')).toBeInTheDocument();
  });
});

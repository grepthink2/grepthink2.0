import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getNotifications = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { getNotifications } }));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' }, access_token: 'token' } }),
}));
vi.mock('@/lib/supabaseClient', () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: () => undefined,
      realtime: { setAuth: () => undefined },
    },
  };
});

import { NotificationsProvider, useNotifications } from '../useNotifications';

function UnreadCount() {
  const { unreadCount, notifications } = useNotifications();
  return <p>{`${unreadCount} unread, ${notifications.length} listed`}</p>;
}

beforeEach(() => {
  getNotifications.mockReset();
  getNotifications.mockResolvedValue({ notifications: [], unread_count: 4, next_cursor: null });
});

describe('NotificationsProvider', () => {
  it('lists the 50 newest unread notifications, as the dropdown shows only those', async () => {
    render(
      <NotificationsProvider>
        <UnreadCount />
      </NotificationsProvider>,
    );
    expect(await screen.findByText('4 unread, 0 listed')).toBeInTheDocument();
    await waitFor(() => expect(getNotifications).toHaveBeenCalled());
    for (const call of getNotifications.mock.calls) {
      // The dropdown listed 50 before the list took pages (the server's page is 30).
      expect(call[0]).toEqual({ view: 'unread', limit: 50 });
    }
  });
});

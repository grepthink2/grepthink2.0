import { beforeEach, describe, expect, it, vi } from 'vitest';

// The client is replaced so each method can be checked at the `apiRequest` seam.
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('../api/client', () => ({ apiRequest }));

import { notificationsApi } from '../api/notifications';

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue(undefined);
});

describe('markNotificationsRead', () => {
  it('posts the ids in one request', async () => {
    await notificationsApi.markNotificationsRead(['n-1', 'n-2']);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ ids: ['n-1', 'n-2'] }),
    });
  });
});

describe('getNotifications', () => {
  it('asks for a view and a page by query', async () => {
    await notificationsApi.getNotifications({ view: 'unread', cursor: 'c' });
    expect(apiRequest).toHaveBeenCalledWith('/api/notifications?view=unread&cursor=c', {
      signal: undefined,
    });
  });

  it('asks for the default view with no options', async () => {
    await notificationsApi.getNotifications();
    expect(apiRequest).toHaveBeenCalledWith('/api/notifications', { signal: undefined });
  });

  it('sends a page size and passes the abort signal through', async () => {
    const controller = new AbortController();
    await notificationsApi.getNotifications({ view: 'all', limit: 50 }, controller.signal);
    expect(apiRequest).toHaveBeenCalledWith('/api/notifications?view=all&limit=50', {
      signal: controller.signal,
    });
  });

  it('carries the cursor it was given as one value, encoded', async () => {
    await notificationsApi.getNotifications({ cursor: 'a+b/c=' });
    expect(apiRequest).toHaveBeenCalledWith('/api/notifications?cursor=a%2Bb%2Fc%3D', {
      signal: undefined,
    });
  });
});

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

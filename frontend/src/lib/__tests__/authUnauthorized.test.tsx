import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth } }));

import { AuthProvider } from '../auth';
import { AUTH_UNAUTHORIZED_EVENT } from '../authEvents';

describe('AuthProvider', () => {
  it('signs out locally when the API reports the session is no longer valid', async () => {
    const { unmount } = render(
      <AuthProvider>
        <div />
      </AuthProvider>,
    );
    window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));

    unmount();
    auth.signOut.mockClear();
    window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});

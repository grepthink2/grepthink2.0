import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type AuthCallback = (event: string, session: unknown) => void;

const auth = vi.hoisted(() => ({
  getSession: vi.fn<() => Promise<{ data: { session: unknown } }>>(),
  onAuthStateChange: vi.fn<(callback: AuthCallback) => { data: { subscription: { unsubscribe: () => void } } }>(
    () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  ),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
}));
const client = vi.hoisted(() => ({ apiRequest: vi.fn<(endpoint: string) => Promise<unknown>>() }));

vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth } }));
vi.mock('@/lib/api/client', () => ({ apiRequest: client.apiRequest }));

import { AuthProvider, useAuth } from '../auth';

function sessionFor(userId: string, userMetadata: Record<string, unknown>) {
  return { access_token: `token-${userId}`, user: { id: userId, user_metadata: userMetadata } };
}

function Probe() {
  const { loading, needsRole, refreshRole, canCreateClasses } = useAuth();
  return (
    <>
      <output data-testid="auth">{loading ? 'loading' : String(canCreateClasses)}</output>
      <output data-testid="needs-role">{String(needsRole)}</output>
      <button onClick={() => void refreshRole()}>refresh</button>
    </>
  );
}

function renderWithSession(session: unknown) {
  auth.getSession.mockResolvedValue({ data: { session } });
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

const probe = () => screen.getByTestId('auth').textContent;

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuthProvider class-creation right', () => {
  it('uses the profile role when the session carries no role metadata', async () => {
    // Accounts created outside the signup flow (seeded QA users) have no
    // user_metadata.role; the backend authorizes them by profiles.role.
    let resolveProfile: (profile: unknown) => void = () => {};
    client.apiRequest.mockReturnValue(new Promise((resolve) => (resolveProfile = resolve)));
    renderWithSession(sessionFor('user-1', {}));

    await waitFor(() => expect(client.apiRequest).toHaveBeenCalledWith('/api/profiles/me'));
    expect(probe()).toBe('loading');

    await act(async () => resolveProfile({ role: 'instructor' }));
    expect(probe()).toBe('true');
  });

  it('prefers the profile role over the role metadata', async () => {
    client.apiRequest.mockResolvedValue({ role: 'student' });
    renderWithSession(sessionFor('user-1', { role: 'instructor' }));

    await waitFor(() => expect(probe()).toBe('false'));
  });

  it('does not wait for the profile when the metadata already has a role', async () => {
    client.apiRequest.mockReturnValue(new Promise(() => {}));
    renderWithSession(sessionFor('user-1', { role: 'instructor' }));

    await waitFor(() => expect(probe()).toBe('true'));
  });

  it('falls back to the metadata role when the profile request fails', async () => {
    client.apiRequest.mockRejectedValue(new Error('backend unavailable'));
    renderWithSession(sessionFor('user-1', {}));

    await waitFor(() => expect(client.apiRequest).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(probe()).toBe('false'));
  });

  it('does not reuse the previous account’s profile role after switching accounts', async () => {
    let emit: AuthCallback = () => {};
    auth.onAuthStateChange.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: () => {} } } };
    });
    client.apiRequest.mockResolvedValueOnce({ role: 'instructor' }).mockReturnValueOnce(new Promise(() => {}));
    renderWithSession(sessionFor('user-1', {}));
    await waitFor(() => expect(probe()).toBe('true'));

    act(() => emit('SIGNED_IN', sessionFor('user-2', {})));
    expect(probe()).toBe('loading');
  });

  it('reports a profile that answered with no role, so the app can send its owner to pick one', async () => {
    // A Google signup: the row exists, the role is for the user to choose.
    client.apiRequest.mockResolvedValue({ id: 'user-1', role: null });
    renderWithSession(sessionFor('user-1', {}));

    await waitFor(() => expect(screen.getByTestId('needs-role').textContent).toBe('true'));
  });

  it('does not mistake an unreachable backend for a missing role', async () => {
    client.apiRequest.mockRejectedValue(new Error('backend unavailable'));
    renderWithSession(sessionFor('user-1', {}));

    await waitFor(() => expect(probe()).toBe('false'));
    expect(screen.getByTestId('needs-role').textContent).toBe('false');
  });

  it('picks up the role as soon as it has been chosen', async () => {
    client.apiRequest.mockResolvedValueOnce({ role: null }).mockResolvedValueOnce({ role: 'instructor' });
    renderWithSession(sessionFor('user-1', {}));
    await waitFor(() => expect(screen.getByTestId('needs-role').textContent).toBe('true'));

    await act(async () => screen.getByRole('button', { name: 'refresh' }).click());

    await waitFor(() => expect(probe()).toBe('true'));
    expect(screen.getByTestId('needs-role').textContent).toBe('false');
  });

  it('does not request a profile without a session', async () => {
    renderWithSession(null);

    await waitFor(() => expect(probe()).toBe('false'));
    expect(client.apiRequest).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { auth: { signInWithPassword, signInWithOAuth: vi.fn() } },
}));
vi.mock('@/lib/api', () => ({
  api: { loginCheck: vi.fn().mockResolvedValue({ message: '', user_id: 'u1', role: 'student' }) },
}));
vi.mock('@features/auth/components/GradientBackGroundWrapper', () => ({ default: () => null }));

import { api } from '@/lib/api';
import Login from '../Login';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<p>the app</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), 'ann@ucsc.edu');
  await user.type(screen.getByLabelText('Password'), 'long-enough-1');
  await user.click(screen.getByRole('button', { name: 'Login' }));
}

describe('Login — a password sign-in records a login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPassword.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls login-check once after the sign-in succeeds, then opens the app', async () => {
    renderLogin();
    await signIn();

    await waitFor(() => expect(api.loginCheck).toHaveBeenCalledTimes(1));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ann@ucsc.edu', password: 'long-enough-1' });
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });

  it('never calls login-check when the sign-in is refused', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    // Login logs the refusal; keep the expected error out of the test output.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderLogin();
    await signIn();

    // The refusal has been handled once its message shows: the call must follow a successful
    // sign-in, not precede it.
    expect(await screen.findByText('Login failed. Please try again.')).toBeInTheDocument();
    expect(api.loginCheck).not.toHaveBeenCalled();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('still opens the app when login-check fails', async () => {
    vi.mocked(api.loginCheck).mockRejectedValueOnce(new Error('network down'));
    renderLogin();
    await signIn();

    await waitFor(() => expect(api.loginCheck).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('the app')).toBeInTheDocument();
  });
});

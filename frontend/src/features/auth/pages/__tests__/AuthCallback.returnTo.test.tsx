import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseAuth = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  getSession: vi.fn(),
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: supabaseAuth } }));
const api = vi.hoisted(() => ({ loginCheck: vi.fn() }));
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api, apiRequest }));

import AuthCallback from '../AuthCallback';

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={['/auth/callback?source=login']}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/app/home" element={<p>home</p>} />
        <Route path="/oauth/consent" element={<p>consent page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  supabaseAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  api.loginCheck.mockResolvedValue({ role: 'student' });
  apiRequest.mockResolvedValue({ first_name: 'Ana', last_name: 'Lee' });
});

describe('AuthCallback after Google sign-in', () => {
  it('goes back to the consent page that sent the student to log in', async () => {
    sessionStorage.setItem('gt:returnTo', '/oauth/consent?authorization_id=auth-1');

    renderCallback();

    expect(await screen.findByText('consent page')).toBeInTheDocument();
    expect(sessionStorage.getItem('gt:returnTo')).toBeNull();
  });

  it('goes home otherwise', async () => {
    renderCallback();

    expect(await screen.findByText('home')).toBeInTheDocument();
  });

  it('goes home when the stored path is not the consent page', async () => {
    sessionStorage.setItem('gt:returnTo', '/app/settings');

    renderCallback();

    expect(await screen.findByText('home')).toBeInTheDocument();
  });
});

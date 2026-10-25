import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const oauth = vi.hoisted(() => ({
  getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { oauth } } }));
const auth = vi.hoisted(() => ({ value: { user: { id: 'u1' } as unknown, loading: false } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@features/auth/components/GradientBackGroundWrapper', () => ({ default: () => null }));
const leave = vi.hoisted(() => ({ leaveSiteTo: vi.fn() }));
vi.mock('@/lib/leaveSite', () => leave);

import OAuthConsent from '../OAuthConsent';

const DETAILS = {
  data: {
    authorization_id: 'auth-1',
    redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
    client: { id: 'c1', name: 'Claude', uri: 'https://claude.ai', logo_uri: '' },
    user: { id: 'u1', email: 'ana@ucsc.edu' },
    scope: 'openid email',
  },
  error: null,
};

function LoginProbe() {
  const location = useLocation();
  return <p>login page, back to {(location.state as { from?: string } | null)?.from}</p>;
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/oauth/consent" element={<OAuthConsent />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  auth.value = { user: { id: 'u1' }, loading: false };
});

describe('OAuthConsent', () => {
  it('says the link is incomplete without an authorization id', () => {
    renderAt('/oauth/consent');

    expect(screen.getByRole('alert')).toHaveTextContent("This sign-in link isn't complete");
    expect(oauth.getAuthorizationDetails).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to log in and back', () => {
    auth.value = { user: null, loading: false };

    renderAt('/oauth/consent?authorization_id=auth-1');

    expect(screen.getByText('login page, back to /oauth/consent?authorization_id=auth-1')).toBeInTheDocument();
    expect(sessionStorage.getItem('gt:returnTo')).toBe('/oauth/consent?authorization_id=auth-1');
  });

  it('names the app asking for access', async () => {
    oauth.getAuthorizationDetails.mockResolvedValue(DETAILS);

    renderAt('/oauth/consent?authorization_id=auth-1');

    expect(await screen.findByRole('heading', { name: 'Connect Claude to GrepThink?' })).toBeInTheDocument();
    expect(screen.getByText(/read your teams' scrum boards and add items to them/)).toBeInTheDocument();
    expect(screen.getByText('ana@ucsc.edu')).toBeInTheDocument();
    expect(oauth.getAuthorizationDetails).toHaveBeenCalledWith('auth-1');
  });

  it('approves', async () => {
    oauth.getAuthorizationDetails.mockResolvedValue(DETAILS);
    oauth.approveAuthorization.mockResolvedValue({ data: { redirect_url: 'x' }, error: null });
    renderAt('/oauth/consent?authorization_id=auth-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));

    expect(oauth.approveAuthorization).toHaveBeenCalledWith('auth-1');
    expect(oauth.denyAuthorization).not.toHaveBeenCalled();
  });

  it('denies', async () => {
    oauth.getAuthorizationDetails.mockResolvedValue(DETAILS);
    oauth.denyAuthorization.mockResolvedValue({ data: { redirect_url: 'x' }, error: null });
    renderAt('/oauth/consent?authorization_id=auth-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Deny' }));

    expect(oauth.denyAuthorization).toHaveBeenCalledWith('auth-1');
  });

  it('shows an expired or unknown request as an error', async () => {
    oauth.getAuthorizationDetails.mockResolvedValue({ data: null, error: new Error('not found') });

    renderAt('/oauth/consent?authorization_id=auth-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('This request has expired or was already used');
  });

  it('follows an earlier consent straight back to the app', async () => {
    oauth.getAuthorizationDetails.mockResolvedValue({
      data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?code=1' },
      error: null,
    });

    renderAt('/oauth/consent?authorization_id=auth-1');

    await vi.waitFor(() =>
      expect(leave.leaveSiteTo).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=1'),
    );
  });
});

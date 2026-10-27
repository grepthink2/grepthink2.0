import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getMcpAuthorization: vi.fn(), answerMcpAuthorization: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));
const auth = vi.hoisted(() => ({
  value: { user: { id: 'u1', email: 'ana@ucsc.edu' } as unknown, loading: false },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@features/auth/components/GradientBackGroundWrapper', () => ({ default: () => null }));
const leave = vi.hoisted(() => ({ leaveSiteTo: vi.fn() }));
vi.mock('@/lib/leaveSite', () => leave);

import OAuthConsent from '../OAuthConsent';

const DETAILS = { app_name: 'Claude', redirect_host: 'claude.ai' };

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
  auth.value = { user: { id: 'u1', email: 'ana@ucsc.edu' }, loading: false };
});

describe('OAuthConsent', () => {
  it('says the link is incomplete without a request', () => {
    renderAt('/oauth/consent');

    expect(screen.getByRole('alert')).toHaveTextContent("This sign-in link isn't complete");
    expect(api.getMcpAuthorization).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to log in and back', () => {
    auth.value = { user: null, loading: false };

    renderAt('/oauth/consent?request=req-1');

    expect(screen.getByText('login page, back to /oauth/consent?request=req-1')).toBeInTheDocument();
    expect(sessionStorage.getItem('gt:returnTo')).toBe('/oauth/consent?request=req-1');
  });

  it('forgets the saved return path once signed in here', async () => {
    sessionStorage.setItem('gt:returnTo', '/oauth/consent?request=req-1');
    api.getMcpAuthorization.mockResolvedValue(DETAILS);

    renderAt('/oauth/consent?request=req-1');

    await screen.findByRole('heading', { name: 'Connect Claude to GrepThink?' });
    expect(sessionStorage.getItem('gt:returnTo')).toBeNull();
  });

  it('names the app, the account and where the student goes back to', async () => {
    api.getMcpAuthorization.mockResolvedValue(DETAILS);

    renderAt('/oauth/consent?request=req-1');

    expect(await screen.findByRole('heading', { name: 'Connect Claude to GrepThink?' })).toBeInTheDocument();
    expect(screen.getByText(/read your teams' scrum boards and add items to them/)).toBeInTheDocument();
    expect(screen.getByText('ana@ucsc.edu')).toBeInTheDocument();
    expect(screen.getByText('claude.ai')).toBeInTheDocument();
    expect(api.getMcpAuthorization).toHaveBeenCalledWith('req-1');
  });

  it('approves and follows the answer back to the app', async () => {
    api.getMcpAuthorization.mockResolvedValue(DETAILS);
    api.answerMcpAuthorization.mockResolvedValue({ redirect_url: 'https://claude.ai/cb?code=c&state=s' });
    renderAt('/oauth/consent?request=req-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));

    expect(api.answerMcpAuthorization).toHaveBeenCalledWith('req-1', true);
    expect(leave.leaveSiteTo).toHaveBeenCalledWith('https://claude.ai/cb?code=c&state=s');
  });

  it('denies', async () => {
    api.getMcpAuthorization.mockResolvedValue(DETAILS);
    api.answerMcpAuthorization.mockResolvedValue({ redirect_url: 'https://claude.ai/cb?error=access_denied' });
    renderAt('/oauth/consent?request=req-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Deny' }));

    expect(api.answerMcpAuthorization).toHaveBeenCalledWith('req-1', false);
    expect(leave.leaveSiteTo).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied');
  });

  it('shows an expired or unknown request as an error', async () => {
    api.getMcpAuthorization.mockRejectedValue(new Error('404'));

    renderAt('/oauth/consent?request=req-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('This request has expired or was already used');
  });

  it('keeps the student on the page when the answer fails', async () => {
    api.getMcpAuthorization.mockResolvedValue(DETAILS);
    api.answerMcpAuthorization.mockRejectedValue(new Error('500'));
    renderAt('/oauth/consent?request=req-1');

    await userEvent.click(await screen.findByRole('button', { name: 'Allow' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send your answer");
    expect(leave.leaveSiteTo).not.toHaveBeenCalled();
  });
});

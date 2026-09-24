import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; user_metadata: Record<string, string> },
  refreshRole: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: auth.user, isLoaded: true }),
  useAuth: () => ({ refreshRole: auth.refreshRole }),
}));
vi.mock('@/lib/api', () => ({ api: { loginCheck: vi.fn(), createUser: vi.fn() } }));
vi.mock('@features/auth/components/GradientBackGroundWrapper', () => ({ default: () => null }));

import { api } from '@/lib/api';
import RoleSelection from '../RoleSelection';

function renderPicker() {
  return render(
    <MemoryRouter initialEntries={['/select']}>
      <Routes>
        <Route path="/select" element={<RoleSelection />} />
        <Route path="/complete-profile" element={<p>complete your profile</p>} />
        <Route path="/app/home" element={<p>the app</p>} />
        <Route path="/instructorsignup" element={<p>instructor signup form</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RoleSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = { id: 'u1', email: 'ann@gmail.com', user_metadata: {} };
    vi.mocked(api.loginCheck).mockResolvedValue({ user_id: 'u1', role: null, message: '' });
    vi.mocked(api.createUser).mockResolvedValue({ message: '', email: 'ann@gmail.com', role: 'instructor' });
  });

  it('saves the role a Google signup picks, refreshes it, then collects their details', async () => {
    renderPicker();

    await userEvent.setup().click(await screen.findByRole('button', { name: /instructor/i }));

    expect(await screen.findByText('complete your profile')).toBeInTheDocument();
    expect(api.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', email: 'ann@gmail.com', userType: 'instructor' }),
    );
    // Without this the route guard still believes the role is missing and bounces them back here.
    expect(auth.refreshRole).toHaveBeenCalledTimes(1);
  });

  it('forwards a signed-in user who already has a role', async () => {
    vi.mocked(api.loginCheck).mockResolvedValue({ user_id: 'u1', role: 'student', message: '' });
    renderPicker();

    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(api.createUser).not.toHaveBeenCalled();
  });

  it('sends a visitor with no session to the signup form for that role', async () => {
    auth.user = null;
    renderPicker();

    await userEvent.setup().click(await screen.findByRole('button', { name: /instructor/i }));

    expect(await screen.findByText('instructor signup form')).toBeInTheDocument();
    await waitFor(() => expect(api.createUser).not.toHaveBeenCalled());
  });
});

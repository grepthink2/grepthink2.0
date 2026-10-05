import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `session.user` is one stable object per test, as the real provider gives.
const session = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ann@gmail.com', user_metadata: {} },
  canCreateClasses: true,
}));
const supabase = vi.hoisted(() => ({
  storage: { from: vi.fn() },
  auth: { updateUser: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => session }));
vi.mock('@/lib/classContext', () => ({ useClass: () => ({ classes: [] }) }));
vi.mock('@/lib/institutions', () => ({ useInstitutions: () => [] }));
vi.mock('@/lib/supabaseClient', () => ({ supabase }));
vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(), api: { checkEmail: vi.fn() } }));

import { api, apiRequest } from '@/lib/api';
import Settings from '../Settings';

const PROFILE = { id: 'u1', email: 'ann@gmail.com', role: 'instructor', first_name: 'Ann', last_name: 'Lee' };

async function openChangeEmail() {
  const user = userEvent.setup();
  render(<Settings isOpen onClose={() => {}} />);
  await waitFor(() => expect(screen.getByLabelText('Email Address')).toHaveValue('ann@gmail.com'));
  await user.click(screen.getByRole('button', { name: 'Change' }));
  const dialog = await screen.findByRole('dialog', { name: 'Change email address' });
  return { user, dialog };
}

async function requestChange(address: string) {
  const { user } = await openChangeEmail();
  await user.type(screen.getByLabelText('New email address'), address);
  await user.click(screen.getByRole('button', { name: 'Send confirmation' }));
  return user;
}

describe('Settings — changing the login email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    session.user = { id: 'u1', email: 'ann@gmail.com', user_metadata: {} };
    vi.mocked(apiRequest).mockResolvedValue(PROFILE);
    vi.mocked(api.checkEmail).mockResolvedValue({ available: true });
    supabase.auth.updateUser.mockResolvedValue({ data: {}, error: null });
  });

  it('keeps the login email read-only and opens the change dialog from its button', async () => {
    const { dialog } = await openChangeEmail();

    expect(screen.getByLabelText('Email Address')).toHaveAttribute('readonly');
    expect(dialog).toHaveTextContent('You sign in as ann@gmail.com');
  });

  it('asks Supabase to change the address and says where the confirmation went', async () => {
    await requestChange('Ann@NewMail.com');

    expect(api.checkEmail).toHaveBeenCalledWith('ann@newmail.com');
    expect(supabase.auth.updateUser).toHaveBeenCalledWith(
      { email: 'ann@newmail.com' },
      { emailRedirectTo: `${window.location.origin}/auth/callback?source=email-change` },
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'We sent a confirmation link to ann@newmail.com',
    );
    expect(screen.getByRole('dialog', { name: 'Change email address' })).toHaveTextContent(
      /stays ann@gmail\.com until you open it/,
    );
    // The field still shows the address the session holds: nothing changed yet.
    expect(screen.getByLabelText('Email Address')).toHaveValue('ann@gmail.com');
  });

  it('refuses an address another account holds before Supabase is asked', async () => {
    vi.mocked(api.checkEmail).mockResolvedValue({ available: false });

    await requestChange('taken@example.com');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This email is already linked to another account.',
    );
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it('refuses the current address and a malformed one without any request', async () => {
    const user = await requestChange('ann@gmail.com');
    expect(await screen.findByRole('alert')).toHaveTextContent('That is already your login email.');

    await user.clear(screen.getByLabelText('New email address'));
    await user.type(screen.getByLabelText('New email address'), 'not an address');
    await user.click(screen.getByRole('button', { name: 'Send confirmation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');

    expect(api.checkEmail).not.toHaveBeenCalled();
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("shows Supabase's refusal as it came", async () => {
    supabase.auth.updateUser.mockResolvedValue({
      data: {},
      error: { message: 'Email rate limit exceeded' },
    });

    await requestChange('ann@newmail.com');

    expect(await screen.findByRole('alert')).toHaveTextContent('Email rate limit exceeded');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

/** A saved profile is announced, so a page that shows it can ask for it again. */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROFILE_SAVED_EVENT } from '@/lib/profileSaved';

const session = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ann@gmail.com', user_metadata: {} },
  canCreateClasses: false,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => session }));
vi.mock('@/lib/classContext', () => ({ useClass: () => ({ classes: [] }) }));
vi.mock('@/lib/institutions', () => ({ useInstitutions: () => [] }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(), api: { checkEmail: vi.fn() } }));

import { apiRequest } from '@/lib/api';
import Settings from '../Settings';

const PROFILE = { id: 'u1', email: 'ann@gmail.com', role: 'student', first_name: 'Ann', last_name: 'Lee', edu_email: null };
const saved = vi.fn();

async function save(patch: () => Promise<unknown>) {
  vi.mocked(apiRequest).mockImplementation((endpoint: string, init?: RequestInit) => {
    if (endpoint === '/api/profiles/me' && !init?.method) return Promise.resolve(PROFILE);
    return patch();
  });
  const user = userEvent.setup();
  render(<Settings isOpen onClose={() => {}} />);
  const github = await screen.findByLabelText(/github/i);
  await waitFor(() => expect(screen.getByLabelText(/first name/i)).toHaveValue('Ann'));
  await user.type(github, 'annlee');
  await user.click(screen.getByRole('button', { name: /save/i }));
}

describe('Settings — a saved profile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.addEventListener(PROFILE_SAVED_EVENT, saved);
  });
  afterEach(() => {
    window.removeEventListener(PROFILE_SAVED_EVENT, saved);
  });

  it('is announced once the save has reached the server', async () => {
    await save(() => Promise.resolve({}));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  });

  it('is not announced when the save fails', async () => {
    await save(() => Promise.reject(new Error('Failed to save changes.')));
    expect(await screen.findByText('Failed to save changes.')).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
  });
});

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// One stable object, as the real provider gives: Settings reloads the profile whenever `user` changes.
const session = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ann@gmail.com', user_metadata: {} },
  role: 'student',
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => session }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(), api: { checkEmail: vi.fn() } }));

import { api, apiRequest } from '@/lib/api';
import Settings from '../Settings';

const PROFILE = {
  id: 'u1',
  email: 'ann@gmail.com',
  role: 'student',
  first_name: 'Ann',
  last_name: 'Lee',
  edu_email: 'old@ucsc.edu',
};

const callsTo = (endpoint: string, method: string) =>
  vi
    .mocked(apiRequest)
    .mock.calls.filter(([url, init]) => url === endpoint && (init as RequestInit | undefined)?.method === method)
    .map(([, init]) => JSON.parse((init as RequestInit).body as string));

describe('Settings — university email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.checkEmail).mockResolvedValue({ available: true });
    vi.mocked(apiRequest).mockImplementation((endpoint: string, init?: RequestInit) => {
      if (endpoint === '/api/profiles/me' && !init?.method) return Promise.resolve(PROFILE);
      return Promise.resolve({ delivery: 'email' });
    });
  });

  it('saves everything else, then asks for a code before the new address counts', async () => {
    const user = userEvent.setup();
    render(<Settings isOpen onClose={() => {}} />);
    const field = await screen.findByLabelText('.edu Email (Roster Email)');
    await waitFor(() => expect(field).toHaveValue('old@ucsc.edu'));

    await user.clear(field);
    await user.type(field, 'ann@ucsc.edu');
    await user.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument();
    const [patch] = callsTo('/api/profiles/me', 'PATCH');
    expect(patch).not.toHaveProperty('edu_email');
    expect(callsTo('/api/profiles/send-edu-verification', 'POST')).toEqual([{ edu_email: 'ann@ucsc.edu' }]);
  });

  it('can still remove the address without a code', async () => {
    const user = userEvent.setup();
    render(<Settings isOpen onClose={() => {}} />);
    const field = await screen.findByLabelText('.edu Email (Roster Email)');
    await waitFor(() => expect(field).toHaveValue('old@ucsc.edu'));

    await user.clear(field);
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(callsTo('/api/profiles/me', 'PATCH')).toHaveLength(1));
    expect(callsTo('/api/profiles/me', 'PATCH')[0]).toMatchObject({ edu_email: null });
    expect(callsTo('/api/profiles/send-edu-verification', 'POST')).toEqual([]);
    expect(screen.queryByText(/enter the 6-digit code/i)).not.toBeInTheDocument();
  });
});

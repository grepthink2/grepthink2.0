import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiInstitution } from '@/lib/api';

const UCSC: ApiInstitution = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc', email_domains: ['ucsc.edu'] };
const IST: ApiInstitution = { id: 'ist', name: 'İstinye University', slug: 'istinye', email_domains: ['istinye.edu.tr'] };

// `session.user` is one stable object per test, as the real provider gives: Settings reloads the
// profile whenever `user` changes.
const session = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ann@gmail.com', user_metadata: {} },
  canCreateClasses: false,
}));
const state = vi.hoisted(() => ({
  classes: [] as { id: string; my_role: string }[],
  institutions: undefined as ApiInstitution[] | null | undefined,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => session }));
vi.mock('@/lib/classContext', () => ({ useClass: () => ({ classes: state.classes }) }));
vi.mock('@/lib/institutions', () => ({ useInstitutions: () => state.institutions }));
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

/** Opens Settings and waits for the saved roster address to fill the field. */
async function openWithRosterField() {
  render(<Settings isOpen onClose={() => {}} />);
  const field = await screen.findByLabelText('School email (roster email)');
  await waitFor(() => expect(field).toHaveValue('old@ucsc.edu'));
  return field;
}

async function saveRosterEmail(address: string) {
  const user = userEvent.setup();
  const field = await openWithRosterField();
  await user.clear(field);
  await user.type(field, address);
  await user.click(screen.getByRole('button', { name: /save/i }));
  return user;
}

describe('Settings — school email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    session.user = { id: 'u1', email: 'ann@gmail.com', user_metadata: {} };
    session.canCreateClasses = false;
    state.classes = [];
    state.institutions = [UCSC, IST];
    vi.mocked(api.checkEmail).mockResolvedValue({ available: true });
    vi.mocked(apiRequest).mockImplementation((endpoint: string, init?: RequestInit) => {
      if (endpoint === '/api/profiles/me' && !init?.method) return Promise.resolve(PROFILE);
      return Promise.resolve({ delivery: 'email' });
    });
  });

  it('saves everything else, then asks for a code before the new address counts', async () => {
    await saveRosterEmail('ann@ucsc.edu');

    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument();
    const [patch] = callsTo('/api/profiles/me', 'PATCH');
    expect(patch).not.toHaveProperty('edu_email');
    expect(callsTo('/api/profiles/send-edu-verification', 'POST')).toEqual([{ edu_email: 'ann@ucsc.edu' }]);
  });

  it('can still remove the address without a code', async () => {
    const user = userEvent.setup();
    const field = await openWithRosterField();

    await user.clear(field);
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(callsTo('/api/profiles/me', 'PATCH')).toHaveLength(1));
    expect(callsTo('/api/profiles/me', 'PATCH')[0]).toMatchObject({ edu_email: null });
    expect(callsTo('/api/profiles/send-edu-verification', 'POST')).toEqual([]);
    expect(screen.queryByText(/enter the 6-digit code/i)).not.toBeInTheDocument();
  });

  it('says the school email was not changed when the code is never entered', async () => {
    const user = await saveRosterEmail('ann@ucsc.edu');
    await screen.findByText(/enter the 6-digit code/i);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByText('Your school email was not changed because it was not verified.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('School email (roster email)')).toHaveValue('old@ucsc.edu');
  });

  it('refuses an address that is not a school email while the schools list is known', async () => {
    await saveRosterEmail('ann@yahoo.com');

    expect(await screen.findByText('Enter your school email address.')).toBeInTheDocument();
    expect(callsTo('/api/profiles/send-edu-verification', 'POST')).toEqual([]);
  });

  it('lets the server decide when the schools list could not load', async () => {
    state.institutions = null;
    await saveRosterEmail('ann@istinye.edu.tr');

    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument();
    expect(callsTo('/api/profiles/send-edu-verification', 'POST')).toEqual([{ edu_email: 'ann@istinye.edu.tr' }]);
  });

  it("shows a login email at a school's domain as the school email, read-only, and sends no code", async () => {
    session.user = { id: 'u1', email: 'ann@stu.istinye.edu.tr', user_metadata: {} };
    const user = userEvent.setup();
    render(<Settings isOpen onClose={() => {}} />);

    const field = await screen.findByLabelText('School email');
    expect(field).toHaveValue('ann@stu.istinye.edu.tr');
    expect(field).toHaveAttribute('readonly');
    expect(screen.queryByLabelText('School email (roster email)')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(callsTo('/api/profiles/me', 'PATCH')).toHaveLength(1));
    expect(callsTo('/api/profiles/me', 'PATCH')[0]).not.toHaveProperty('edu_email');
    expect(callsTo('/api/profiles/send-edu-verification', 'POST')).toEqual([]);
  });

  it('shows the roster email and portfolio to an account that creates classes but TAs somewhere', async () => {
    session.canCreateClasses = true;
    state.classes = [
      { id: 'taught', my_role: 'instructor' },
      { id: 'assisted', my_role: 'ta' },
    ];
    render(<Settings isOpen onClose={() => {}} />);

    expect(await screen.findByLabelText('School email (roster email)')).toBeInTheDocument();
    expect(screen.getByLabelText('LinkedIn Username')).toBeInTheDocument();
    expect(screen.getByLabelText('GitHub Username')).toBeInTheDocument();
  });

  it('leaves them out for an account that only teaches', async () => {
    session.canCreateClasses = true;
    state.classes = [{ id: 'taught', my_role: 'instructor' }];
    render(<Settings isOpen onClose={() => {}} />);

    await waitFor(() => expect(screen.getByLabelText('First Name')).toHaveValue('Ann'));
    expect(screen.queryByLabelText('School email (roster email)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('LinkedIn Username')).not.toBeInTheDocument();
  });
});

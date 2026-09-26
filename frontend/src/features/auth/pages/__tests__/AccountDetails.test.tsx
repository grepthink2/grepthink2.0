import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(), api: { checkEmail: vi.fn() } }));
vi.mock('@/lib/institutions', () => ({ useInstitutions: () => [] }));

import { api, apiRequest } from '@/lib/api';
import AccountDetails from '../AccountDetails';

function renderDetails(props: { email: string; userType: 'student' | 'instructor' }) {
  return render(
    <MemoryRouter initialEntries={['/complete-profile']}>
      <Routes>
        <Route path="/complete-profile" element={<AccountDetails {...props} />} />
        <Route path="/app/home" element={<p>the app</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const bodyOf = (endpoint: string) => {
  const call = vi.mocked(apiRequest).mock.calls.find(([url]) => url === endpoint);
  return call ? JSON.parse((call[1] as RequestInit).body as string) : undefined;
};

async function fillNames(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('First Name'), 'Ann');
  await user.type(screen.getByLabelText('Last Name'), 'Lee');
}

describe('AccountDetails', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiRequest).mockResolvedValue({ delivery: 'email' });
    vi.mocked(api.checkEmail).mockResolvedValue({ available: true });
  });

  it('asks for a code instead of saving a roster email nobody has proven they own', async () => {
    const user = userEvent.setup();
    renderDetails({ email: 'ann@gmail.com', userType: 'student' });
    await fillNames(user);
    await user.type(screen.getByLabelText('Roster school email'), 'ann@ucsc.edu');

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument();
    expect(bodyOf('/api/profiles/me')).toEqual({ first_name: 'Ann', last_name: 'Lee' });
    expect(bodyOf('/api/profiles/send-edu-verification')).toEqual({ edu_email: 'ann@ucsc.edu' });
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('lets a student verify later rather than blocking signup on email delivery', async () => {
    const user = userEvent.setup();
    renderDetails({ email: 'ann@gmail.com', userType: 'student' });
    await fillNames(user);

    await user.click(screen.getByRole('button', { name: /verify later/i }));

    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(bodyOf('/api/profiles/me')).toEqual({ first_name: 'Ann', last_name: 'Lee' });
    expect(bodyOf('/api/profiles/send-edu-verification')).toBeUndefined();
  });

  it('shows why a code could not be sent and stays on the page', async () => {
    vi.mocked(apiRequest).mockImplementation((endpoint: string) =>
      endpoint === '/api/profiles/send-edu-verification'
        ? Promise.reject(new Error('A code was just sent. Please wait a minute before asking for another.'))
        : Promise.resolve({}),
    );
    const user = userEvent.setup();
    renderDetails({ email: 'ann@gmail.com', userType: 'student' });
    await fillNames(user);
    await user.type(screen.getByLabelText('Roster school email'), 'ann@ucsc.edu');

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText(/please wait a minute/i)).toBeInTheDocument();
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
  });

  it('needs no code when the login email is already a school email', async () => {
    const user = userEvent.setup();
    renderDetails({ email: 'ann@ucsc.edu', userType: 'student' });
    await fillNames(user);

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('the app')).toBeInTheDocument();
    expect(bodyOf('/api/profiles/send-edu-verification')).toBeUndefined();
    expect(screen.queryByRole('button', { name: /verify later/i })).not.toBeInTheDocument();
  });

  it('asks an instructor for a name only', async () => {
    const user = userEvent.setup();
    renderDetails({ email: 'prof@gmail.com', userType: 'instructor' });
    await fillNames(user);

    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(await screen.findByText('the app')).toBeInTheDocument();
    await waitFor(() => expect(bodyOf('/api/profiles/me')).toEqual({ first_name: 'Ann', last_name: 'Lee' }));
  });
});

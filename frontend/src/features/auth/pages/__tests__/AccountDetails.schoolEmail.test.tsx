import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiInstitution } from '@/lib/api';

const IST: ApiInstitution = { id: 'istinye', name: 'İstinye University', slug: 'istinye', email_domains: ['istinye.edu.tr'] };

// undefined: still loading · null: could not load · the list
const schools = vi.hoisted(() => ({ list: undefined as ApiInstitution[] | null | undefined }));
vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(), api: { checkEmail: vi.fn() } }));
vi.mock('@/lib/institutions', () => ({ useInstitutions: () => schools.list }));

import { api, apiRequest } from '@/lib/api';
import AccountDetails from '../AccountDetails';

function page(props: { email: string; userType: 'student' | 'instructor' }) {
  return (
    <MemoryRouter initialEntries={['/complete-profile']}>
      <Routes>
        <Route path="/complete-profile" element={<AccountDetails {...props} />} />
        <Route path="/app/home" element={<p>the app</p>} />
      </Routes>
    </MemoryRouter>
  );
}

const sentCodeTo = () =>
  vi
    .mocked(apiRequest)
    .mock.calls.filter(([url]) => url === '/api/profiles/send-edu-verification')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string).edu_email);

async function continueWithRosterEmail(rosterEmail: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('First Name'), 'Ann');
  await user.type(screen.getByLabelText('Last Name'), 'Lee');
  await user.type(screen.getByLabelText('Roster school email'), rosterEmail);
  await user.click(screen.getByRole('button', { name: /continue/i }));
}

describe('AccountDetails — school email beyond .edu', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    schools.list = [IST];
    vi.mocked(apiRequest).mockResolvedValue({ delivery: 'email' });
    vi.mocked(api.checkEmail).mockResolvedValue({ available: true });
  });

  it('treats a subdomain of an institution email_domain as the roster email, read-only', async () => {
    render(page({ email: 'ann@stu.istinye.edu.tr', userType: 'student' }));

    const field = await screen.findByLabelText('School email');
    expect(field).toHaveValue('ann@stu.istinye.edu.tr');
    expect(field).toHaveAttribute('readonly');
    expect(screen.queryByLabelText('Roster school email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify later/i })).not.toBeInTheDocument();
  });

  it('turns the field read-only once the schools list arrives', () => {
    schools.list = undefined; // the first render: the list is still loading
    const { rerender } = render(page({ email: 'ann@istinye.edu.tr', userType: 'student' }));
    expect(screen.getByLabelText('Roster school email')).not.toHaveAttribute('readonly');

    schools.list = [IST];
    rerender(page({ email: 'ann@istinye.edu.tr', userType: 'student' }));
    const field = screen.getByLabelText('School email');
    expect(field).toHaveValue('ann@istinye.edu.tr');
    expect(field).toHaveAttribute('readonly');
  });

  it('refuses a roster email that is not a school email while the list is known', async () => {
    render(page({ email: 'ann@gmail.com', userType: 'student' }));
    await continueWithRosterEmail('ann@yahoo.com');
    expect(await screen.findByText('Roster email must be a school email address.')).toBeInTheDocument();
    expect(sentCodeTo()).toEqual([]);
  });

  it('lets the server decide when the schools list could not load', async () => {
    schools.list = null;
    render(page({ email: 'ann@gmail.com', userType: 'student' }));
    await continueWithRosterEmail('ann@istinye.edu.tr');
    expect(await screen.findByText(/enter the 6-digit code/i)).toBeInTheDocument();
    expect(sentCodeTo()).toEqual(['ann@istinye.edu.tr']);
  });
});

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiRequest: vi.fn(), api: { checkEmail: vi.fn() } }));
vi.mock('@/lib/institutions', () => ({
  useInstitutions: () => [
    { id: 'istinye', name: 'İstinye University', slug: 'istinye', email_domains: ['istinye.edu.tr'] },
  ],
}));

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

describe('AccountDetails — school email beyond .edu', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiRequest).mockResolvedValue({ delivery: 'email' });
    vi.mocked(api.checkEmail).mockResolvedValue({ available: true });
  });

  it('treats a subdomain of an institution email_domain as the roster email, read-only', async () => {
    renderDetails({ email: 'ann@stu.istinye.edu.tr', userType: 'student' });

    const field = await screen.findByLabelText('School Email');
    expect(field).toHaveValue('ann@stu.istinye.edu.tr');
    expect(field).toHaveAttribute('readonly');
    expect(screen.queryByLabelText('Roster School Email')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify later/i })).not.toBeInTheDocument();
  });
});

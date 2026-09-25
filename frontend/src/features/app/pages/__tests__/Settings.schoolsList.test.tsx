/** Settings with the real schools-list hook: only the API is mocked. */
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiInstitution } from '@/lib/api';

const IST: ApiInstitution = { id: 'ist', name: 'İstinye University', slug: 'istinye', email_domains: ['istinye.edu.tr'] };

const session = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ann@istinye.edu.tr', user_metadata: {} },
  canCreateClasses: false,
}));
const api = vi.hoisted(() => ({ getInstitutions: vi.fn(), checkEmail: vi.fn() }));
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ useAuth: () => session }));
vi.mock('@/lib/classContext', () => ({ useClass: () => ({ classes: [] }) }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock('@/lib/api', () => ({ api, apiRequest }));

import { clearInstitutionsCache } from '@/lib/institutions';
import Settings from '../Settings';

beforeEach(() => {
  clearInstitutionsCache();
  vi.resetAllMocks();
  apiRequest.mockResolvedValue({ id: 'u1', email: 'ann@istinye.edu.tr', first_name: 'Ann', last_name: 'Lee' });
});

describe('Settings — the schools list', () => {
  it('is asked for when Settings opens, not at app start, and again after a failure', async () => {
    api.getInstitutions.mockResolvedValueOnce(null).mockResolvedValueOnce([IST]);
    const { rerender } = render(<Settings isOpen={false} onClose={() => {}} />);
    expect(api.getInstitutions).not.toHaveBeenCalled();

    rerender(<Settings isOpen onClose={() => {}} />);
    await waitFor(() => expect(api.getInstitutions).toHaveBeenCalledTimes(1));
    // Could not load: the login email is not known to be a school email yet.
    expect(await screen.findByLabelText('School email (roster email)')).toBeInTheDocument();

    rerender(<Settings isOpen={false} onClose={() => {}} />);
    rerender(<Settings isOpen onClose={() => {}} />);
    await waitFor(() => expect(api.getInstitutions).toHaveBeenCalledTimes(2));
    const field = await screen.findByLabelText('School email');
    expect(field).toHaveValue('ann@istinye.edu.tr');
    expect(field).toHaveAttribute('readonly');
  });
});

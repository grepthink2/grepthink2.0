/** Settings opens on the section it is told to, Profile otherwise. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'ann@gmail.com', user_metadata: {} }, canCreateClasses: false }),
}));
vi.mock('@/lib/classContext', () => ({ useClass: () => ({ classes: [] }) }));
vi.mock('@/lib/institutions', () => ({ useInstitutions: () => [] }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock('@/lib/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ApiError,
    apiRequest: vi.fn().mockResolvedValue({ id: 'u1', email: 'ann@gmail.com', role: 'student' }),
    api: {
      checkEmail: vi.fn(),
      getEmailPreferences: vi.fn().mockResolvedValue({ preferences: [] }),
      updateEmailPreferences: vi.fn(),
      getMcpConnections: vi.fn().mockResolvedValue({ connections: [] }),
    },
  };
});

import Settings from '../Settings';

const current = () => screen.getAllByRole('button').filter((button) => button.getAttribute('aria-current') === 'true');

describe('Settings — the section it opens on', () => {
  it('is Profile unless another is named', () => {
    render(<Settings isOpen onClose={() => {}} />);
    expect(current().map((button) => button.textContent)).toEqual(['Profile']);
  });

  it.each([
    ['email', 'Email'],
    ['apps', 'Connected apps'],
    ['profile', 'Profile'],
  ] as const)('is %s when asked', (section, label) => {
    render(<Settings isOpen onClose={() => {}} initialSection={section} />);
    expect(current().map((button) => button.textContent)).toEqual([label]);
  });
});

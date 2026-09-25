import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiInstitution } from '@/lib/api';

const IST: ApiInstitution = { id: 'ist', name: 'İstinye University', slug: 'istinye', email_domains: ['istinye.edu.tr'] };

const signUp = vi.hoisted(() => vi.fn());
const fetchInstitutions = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { signUp, signInWithOAuth: vi.fn() } } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ getToken: vi.fn() }) }));
vi.mock('@/lib/api', () => ({ api: { checkEmail: vi.fn(), createUser: vi.fn() } }));
vi.mock('@/lib/institutions', () => ({ fetchInstitutions }));

import { api } from '@/lib/api';
import SignUp from '../SignUp';

const onAccountCreated = vi.fn();

function renderSignUp() {
  render(
    <MemoryRouter>
      <SignUp userType="student" onAccountCreated={onAccountCreated} />
    </MemoryRouter>,
  );
}

async function signUpWith(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'long-enough-1');
  await user.type(screen.getByLabelText('Confirm Password'), 'long-enough-1');
  await user.click(screen.getByRole('button', { name: 'Create Account' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 'token' } }, error: null });
  vi.mocked(api.checkEmail).mockResolvedValue({ available: true });
  vi.mocked(api.createUser).mockResolvedValue({ message: '', email: '', role: 'student' });
});

describe('SignUp — school email check', () => {
  it('asks for the schools list as soon as the form opens', () => {
    fetchInstitutions.mockReturnValue(new Promise(() => {}));
    renderSignUp();
    expect(fetchInstitutions).toHaveBeenCalledTimes(1);
  });

  it('checks a .edu address without waiting for the schools list', async () => {
    fetchInstitutions.mockReturnValue(new Promise(() => {})); // never answers
    renderSignUp();
    await signUpWith('ann@ucsc.edu');
    await waitFor(() => expect(onAccountCreated).toHaveBeenCalledWith('ann@ucsc.edu'));
    expect(api.checkEmail).toHaveBeenCalledWith('ann@ucsc.edu');
  });

  it('checks an address at a school the list names', async () => {
    fetchInstitutions.mockResolvedValue([IST]);
    renderSignUp();
    await signUpWith('ann@stu.istinye.edu.tr');
    await waitFor(() => expect(onAccountCreated).toHaveBeenCalled());
    expect(api.checkEmail).toHaveBeenCalledWith('ann@stu.istinye.edu.tr');
  });

  it('still signs up when the schools list could not load', async () => {
    fetchInstitutions.mockResolvedValue(null);
    renderSignUp();
    await signUpWith('ann@gmail.com');
    await waitFor(() => expect(onAccountCreated).toHaveBeenCalledWith('ann@gmail.com'));
    expect(api.checkEmail).not.toHaveBeenCalled();
    expect(signUp).toHaveBeenCalledTimes(1);
  });
});

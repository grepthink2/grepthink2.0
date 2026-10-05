import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ auth: { verifyOtp: vi.fn() } }));
vi.mock('@/lib/supabaseClient', () => ({ supabase }));
vi.mock('@features/auth/components/GradientBackGroundWrapper', () => ({ default: () => null }));

import AuthConfirm from '../AuthConfirm';

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/confirm" element={<AuthConfirm />} />
        <Route path="/app/home" element={<p>the app home</p>} />
        <Route path="/reset-password" element={<p>the reset form</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  supabase.auth.verifyOtp.mockResolvedValue({ data: {}, error: null });
});

describe('AuthConfirm', () => {
  it('verifies a confirmed email change and lands in the app', async () => {
    renderAt('/auth/confirm?token_hash=abc&type=email_change');

    expect(await screen.findByText('the app home')).toBeInTheDocument();
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'email_change' });
  });

  it('still sends a password recovery link to the reset form', async () => {
    renderAt('/auth/confirm?token_hash=abc&type=recovery');

    expect(await screen.findByText('the reset form')).toBeInTheDocument();
  });

  it("shows Supabase's error for a link it refuses", async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token has expired' } });

    renderAt('/auth/confirm?token_hash=abc&type=email_change');

    expect(await screen.findByRole('alert')).toHaveTextContent('Token has expired');
  });
});

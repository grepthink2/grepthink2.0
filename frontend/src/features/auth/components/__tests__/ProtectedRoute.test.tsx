import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  value: { session: null as unknown, loading: false, needsRole: false },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => state.value }));

import { ProtectedRoute } from '../ProtectedRoute';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/select" element={<p>role picker</p>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/app/home" element={<p>the app</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    state.value = { session: null, loading: false, needsRole: false };
  });

  it('sends a visitor with no session to the login page', () => {
    renderAt('/app/home');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('lets a signed-in user with a role into the app', () => {
    state.value = { session: { user: { id: 'u1' } }, loading: false, needsRole: false };
    renderAt('/app/home');
    expect(screen.getByText('the app')).toBeInTheDocument();
  });

  it('sends a signed-in user who has not picked a role to the role picker', () => {
    // A Google signup has a session and a profile row but no role until they choose one;
    // every role-gated endpoint would answer 403 for them inside the app.
    state.value = { session: { user: { id: 'u1' } }, loading: false, needsRole: true };
    renderAt('/app/home');
    expect(screen.getByText('role picker')).toBeInTheDocument();
  });

  it('waits while the session or the role is still being resolved', () => {
    state.value = { session: null, loading: true, needsRole: false };
    renderAt('/app/home');
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

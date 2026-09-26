import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassRole } from '@/lib/api';

const state = vi.hoisted(() => ({
  selectedClass: { id: 'c1' } as { id: string } | null,
  loading: false,
  role: 'ta' as ClassRole | null | undefined,
}));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: state.selectedClass, loading: state.loading }),
  useSelectedClassRole: () => state.role,
}));

import RequireReviewAccess from '../RequireReviewAccess';

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/app/ta-review/final-reviews']}>
      <Routes>
        <Route element={<RequireReviewAccess />}>
          <Route path="/app/ta-review/final-reviews" element={<p>final reviews</p>} />
        </Route>
        <Route path="/app" element={<p>app home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.selectedClass = { id: 'c1' };
  state.loading = false;
  state.role = 'ta';
});

describe('RequireReviewAccess', () => {
  it('lets the instructor and the TAs of the selected class in', () => {
    for (const role of ['instructor', 'ta'] as const) {
      state.role = role;
      const { unmount } = renderGuard();
      expect(screen.getByText('final reviews')).toBeInTheDocument();
      unmount();
    }
  });

  it('sends a student, or someone with no class, to the app', () => {
    state.role = 'student';
    const { unmount } = renderGuard();
    expect(screen.getByText('app home')).toBeInTheDocument();
    unmount();

    state.selectedClass = null;
    state.role = null;
    renderGuard();
    expect(screen.getByText('app home')).toBeInTheDocument();
  });

  it('waits while the first class list loads', () => {
    state.selectedClass = null;
    state.loading = true;
    state.role = undefined;
    const { container } = renderGuard();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    expect(screen.queryByText('final reviews')).not.toBeInTheDocument();
    expect(screen.queryByText('app home')).not.toBeInTheDocument();
  });

  it('keeps the page (and its unsaved edits) mounted while the class list refreshes with a spinner', () => {
    state.loading = true; // a refresh; the selected class, and so the role, stay known
    renderGuard();
    expect(screen.getByText('final reviews')).toBeInTheDocument();
  });
});

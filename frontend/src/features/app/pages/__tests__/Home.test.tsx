import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassRole } from '@/lib/api';

const state = vi.hoisted(() => ({
  canCreateClasses: false,
  classesLoading: false,
  selectedClass: null as { id: string } | null,
  role: null as ClassRole | null | undefined,
}));
vi.mock('@/lib/auth', () => ({
  useUser: () => ({ user: { id: 'me' }, isLoaded: true }),
  useAuth: () => ({ canCreateClasses: state.canCreateClasses }),
}));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: state.selectedClass, loading: state.classesLoading }),
  useSelectedClassRole: () => state.role,
}));
vi.mock('@features/app/components/Home/StudentHomeDashboard', () => ({ default: () => 'student home' }));
vi.mock('@features/app/components/Home/InstructorHomeDashboard', () => ({ default: () => 'instructor home' }));

import Home from '../Home';

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.canCreateClasses = false;
  state.classesLoading = false;
  state.selectedClass = { id: 'c1' };
  state.role = 'student';
});

describe('Home', () => {
  it('shows the instructor home in a class you own', () => {
    state.role = 'instructor';
    renderHome();
    expect(screen.getByText('instructor home')).toBeInTheDocument();
  });

  it('shows the student home in a class you TA, even for an account that can create classes', () => {
    state.canCreateClasses = true;
    state.role = 'ta';
    renderHome();
    expect(screen.getByText('student home')).toBeInTheDocument();
  });

  it('with no class selected, follows what the account can do', () => {
    state.selectedClass = null;
    state.role = null;
    state.canCreateClasses = true;
    const { unmount } = renderHome();
    expect(screen.getByText('instructor home')).toBeInTheDocument();
    unmount();

    state.canCreateClasses = false;
    renderHome();
    expect(screen.getByText('student home')).toBeInTheDocument();
  });

  it('waits for the classes before choosing', () => {
    state.selectedClass = null;
    state.role = undefined;
    state.classesLoading = true;
    const { container } = renderHome();
    expect(screen.queryByText(/home$/)).not.toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });
});

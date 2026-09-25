import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Class, ClassRole } from '@/lib/classContext';

const state = vi.hoisted(() => ({
  canCreateClasses: true,
  role: 'instructor' as ClassRole | null | undefined,
  ctx: {
    sidebarClasses: [] as Class[],
    selectedClass: null as Class | null,
    setSelectedClass: vi.fn(),
    showSchoolSwitcher: false,
  },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ canCreateClasses: state.canCreateClasses }) }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => state.ctx,
  useSelectedClassRole: () => state.role,
}));
vi.mock('@features/messages/hooks/useUnreadTotal', () => ({ useUnreadTotal: () => 0 }));

import Sidebar from '../Sidebar';

const UCSC = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };

function cls(id: string, name: string, my_role: ClassRole): Class {
  return {
    id,
    name,
    course_code: `${name.toUpperCase()}-CODE`,
    created_by: my_role === 'instructor' ? 'me' : 'prof',
    created_at: '2026-01-01',
    my_role,
    institution: UCSC,
  };
}

const taught = cls('alpha', 'Alpha', 'instructor');
const assisted = cls('beta', 'Beta', 'ta');

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const openClassSwitcher = () => fireEvent.click(screen.getByRole('button', { name: /^Alpha/ }));

beforeAll(() => {
  // jsdom has no matchMedia; the sidebar reads it for the mobile breakpoint.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  state.canCreateClasses = true;
  state.role = 'instructor';
  state.ctx.sidebarClasses = [taught, assisted];
  state.ctx.selectedClass = taught;
  state.ctx.showSchoolSwitcher = false;
  state.ctx.setSelectedClass.mockReset();
});

describe('Sidebar', () => {
  it('shows the class items for your role in the selected class', () => {
    state.role = 'ta';
    state.ctx.selectedClass = assisted;
    renderAt('/app/home');
    expect(screen.getByText('Class: Beta')).toBeInTheDocument();
    expect(screen.getByText('Create Class')).toBeInTheDocument();
    expect(screen.getByText('TA Review')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('hides the class section when no class is selected', () => {
    state.canCreateClasses = false;
    state.role = null;
    state.ctx.selectedClass = null;
    state.ctx.sidebarClasses = [];
    renderAt('/app/home');
    expect(screen.getByText('No class selected')).toBeInTheDocument();
    expect(screen.getByText('Join Class')).toBeInTheDocument();
    expect(screen.queryByText('My Project')).not.toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it("lands on your role's page after switching to a class where this page is not allowed", () => {
    renderAt('/app/dashboard');
    openClassSwitcher();
    fireEvent.click(screen.getByText('Beta'));
    expect(state.ctx.setSelectedClass).toHaveBeenCalledWith(assisted);
    expect(screen.getByTestId('path').textContent).toBe('/app/ta-meetings');
  });

  it('stays on a page the new class allows', () => {
    renderAt('/app/messages');
    openClassSwitcher();
    fireEvent.click(screen.getByText('Beta'));
    expect(state.ctx.setSelectedClass).toHaveBeenCalledWith(assisted);
    expect(screen.getByTestId('path').textContent).toBe('/app/messages');
  });

  it('stays put when you pick the class you are already in, even while previewing it', () => {
    // "View class as student" shows your own class as a student's; re-picking it ends nothing.
    state.role = 'student';
    renderAt('/app/my-project');
    openClassSwitcher();
    fireEvent.click(screen.getByText('ALPHA-CODE'));
    expect(state.ctx.setSelectedClass).toHaveBeenCalledWith(taught);
    expect(screen.getByTestId('path').textContent).toBe('/app/my-project');
  });

  it('captions the selected class with its school only when classes span schools', () => {
    const { unmount } = renderAt('/app/home');
    expect(screen.queryByText('UC Santa Cruz')).not.toBeInTheDocument();
    unmount();

    state.ctx.showSchoolSwitcher = true;
    renderAt('/app/home');
    expect(screen.getByText('UC Santa Cruz')).toBeInTheDocument();
  });

  it('labels each class with your role only when the list mixes roles', () => {
    const { unmount } = renderAt('/app/home');
    openClassSwitcher();
    expect(screen.getByText('Instructor')).toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument();
    unmount();

    state.ctx.sidebarClasses = [taught, cls('gamma', 'Gamma', 'instructor')];
    renderAt('/app/home');
    openClassSwitcher();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
    expect(screen.queryByText('Instructor')).not.toBeInTheDocument();
  });
});

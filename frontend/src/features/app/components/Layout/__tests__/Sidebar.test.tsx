import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Class, ClassRole } from '@/lib/classContext';

const state = vi.hoisted(() => ({
  canCreateClasses: true,
  previewing: false,
  role: 'instructor' as ClassRole | null | undefined,
  ctx: {
    sidebarClasses: [] as Class[],
    selectedClass: null as Class | null,
    setSelectedClass: vi.fn(),
    showSchoolSwitcher: false,
  },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ canCreateClasses: state.canCreateClasses }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: state.previewing }) }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => state.ctx,
  useSelectedClassRole: () => state.role,
}));
vi.mock('@features/messages/hooks/useUnreadTotal', () => ({ useUnreadTotal: () => 0 }));

import Sidebar from '../Sidebar';
import { SIDEBAR_HOVER } from '../../../config/sidebar';

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
  state.previewing = false;
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
    expect(screen.queryByRole('heading', { name: 'Beta' })).not.toBeInTheDocument(); // the class tile names it
    expect(screen.getByText('Create Class')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TA Review' })).toBeInTheDocument();
    expect(screen.getByText('TSRs')).toBeInTheDocument();
    expect(screen.getByText('Final Reviews')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it("shows a TA whose account can't create classes the student sidebar plus TA Review", () => {
    state.canCreateClasses = false;
    state.role = 'ta';
    state.ctx.selectedClass = assisted;
    renderAt('/app/home');
    expect(screen.getByText('Join Class')).toBeInTheDocument();
    expect(screen.queryByText('Create Class')).not.toBeInTheDocument();
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.getByText('TSRs')).toBeInTheDocument();
  });

  it("shows the account's usual class section while the classes load", () => {
    state.role = undefined;
    state.ctx.selectedClass = null;
    state.ctx.sidebarClasses = [];
    const { unmount } = renderAt('/app/home');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    unmount();

    state.canCreateClasses = false;
    renderAt('/app/home');
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.queryByText('TSRs')).not.toBeInTheDocument();
  });

  it('keeps Projects lit on a project page while the classes load', () => {
    state.role = undefined;
    state.ctx.selectedClass = null;
    renderAt('/app/projects/p1');
    expect(screen.getByText('Projects').closest('button')).toHaveClass('active');
  });

  it('shows the Main section of a student account while previewing your class as a student', () => {
    state.previewing = true;
    state.role = 'student'; // the previewed class shows as a student's
    renderAt('/app/home');
    expect(screen.getByText('Join Class')).toBeInTheDocument();
    expect(screen.queryByText('Create Class')).not.toBeInTheDocument();
    expect(screen.getByText('My Project')).toBeInTheDocument();
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

describe('the Tasks - External link', () => {
  const JOB_BOARD = 'https://job191.yeterly.ai/';
  const tasksLink = () => screen.queryByRole('link', { name: /Tasks - External/ });

  it("opens the selected class's link in a new tab, last under Coursework", () => {
    state.canCreateClasses = false;
    state.role = 'student';
    state.ctx.selectedClass = { ...cls('job', 'JOB-191', 'student'), external_tasks_url: JOB_BOARD };
    renderAt('/app/home');

    const link = tasksLink();
    expect(link).toHaveAttribute('href', JOB_BOARD);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link?.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));
    expect(link).toHaveAccessibleName(/opens in a new tab/i);
    const group = link?.closest('.sidebar-group') as HTMLElement;
    expect(within(group).getByRole('heading')).toHaveTextContent('Coursework');
    expect(within(group).getAllByRole('listitem').at(-1)).toContainElement(link);
  });

  it("shows the instructor their class's link too", () => {
    state.ctx.selectedClass = { ...taught, external_tasks_url: JOB_BOARD };
    renderAt('/app/home');
    expect(tasksLink()).toHaveAttribute('href', JOB_BOARD);
  });

  it('is not there when the class has no link', () => {
    renderAt('/app/home');
    expect(screen.getByText('Modules')).toBeInTheDocument();
    expect(tasksLink()).not.toBeInTheDocument();
    expect(screen.queryByText('Tasks - External')).not.toBeInTheDocument();
  });

  it('never turns a stored link that is not http(s) into a link', () => {
    state.ctx.selectedClass = { ...taught, external_tasks_url: 'javascript:alert(document.cookie)' };
    renderAt('/app/home');
    expect(screen.queryByText('Tasks - External')).not.toBeInTheDocument();
  });

  it('closes the phone drawer once it opens the link', () => {
    state.ctx.selectedClass = { ...taught, external_tasks_url: JOB_BOARD };
    const onMobileClose = vi.fn();
    render(
      <MemoryRouter initialEntries={['/app/home']}>
        <Sidebar mobileOpen onMobileClose={onMobileClose} />
      </MemoryRouter>,
    );
    // jsdom cannot open a tab; keep it from trying.
    const link = tasksLink() as HTMLElement;
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    expect(onMobileClose).toHaveBeenCalledTimes(1);
  });
});

describe('the rail', () => {
  // Only the timers the rail sets; React's own scheduling stays real.
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  const rail = () => document.querySelector('.sidebar') as HTMLElement;
  const isExpanded = () => rail().getAttribute('data-expanded') === 'true';
  const settle = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const hoverIn = () => {
    fireEvent.pointerEnter(rail(), { pointerType: 'mouse' });
    settle(SIDEBAR_HOVER.openDelayMs);
  };
  const hoverOut = () => fireEvent.pointerLeave(rail(), { pointerType: 'mouse' });

  it('rests collapsed, with no expand button', () => {
    renderAt('/app/home');
    expect(isExpanded()).toBe(false);
    expect(screen.queryByRole('button', { name: /collapse|expand/i })).not.toBeInTheDocument();
  });

  it('expands once the pointer has rested on it, and holds while it stays', () => {
    renderAt('/app/home');
    fireEvent.pointerEnter(rail(), { pointerType: 'mouse' });
    expect(isExpanded()).toBe(false);
    settle(SIDEBAR_HOVER.openDelayMs);
    expect(isExpanded()).toBe(true);
    settle(10_000);
    expect(isExpanded()).toBe(true);
  });

  it('ignores a pointer that only passes through', () => {
    renderAt('/app/home');
    fireEvent.pointerEnter(rail(), { pointerType: 'mouse' });
    settle(SIDEBAR_HOVER.openDelayMs - 1);
    hoverOut();
    settle(10_000);
    expect(isExpanded()).toBe(false);
  });

  it('collapses a moment after the pointer leaves', () => {
    renderAt('/app/home');
    hoverIn();
    hoverOut();
    settle(SIDEBAR_HOVER.closeDelayMs - 1);
    expect(isExpanded()).toBe(true);
    settle(1);
    expect(isExpanded()).toBe(false);
  });

  it('stays open when the pointer comes back before it has closed', () => {
    renderAt('/app/home');
    hoverIn();
    hoverOut();
    settle(SIDEBAR_HOVER.closeDelayMs - 1);
    fireEvent.pointerEnter(rail(), { pointerType: 'mouse' });
    settle(10_000);
    expect(isExpanded()).toBe(true);
  });

  it('does not expand for a touch', () => {
    renderAt('/app/home');
    fireEvent.pointerEnter(rail(), { pointerType: 'touch' });
    settle(10_000);
    expect(isExpanded()).toBe(false);
  });

  it('expands for keyboard focus inside it and collapses when focus leaves', () => {
    renderAt('/app/home');
    const home = screen.getByRole('button', { name: 'Home' });
    fireEvent.focus(home);
    expect(isExpanded()).toBe(true);
    fireEvent.blur(home, { relatedTarget: null });
    expect(isExpanded()).toBe(false);
  });

  it('does not hold for the focus a click leaves behind', () => {
    renderAt('/app/home');
    const messages = screen.getByRole('button', { name: 'Messages' });
    fireEvent.pointerDown(messages);
    fireEvent.focus(messages);
    fireEvent.pointerUp(messages);
    expect(isExpanded()).toBe(false);
  });

  it('lets go after a keyboard navigation', () => {
    renderAt('/app/home');
    const messages = screen.getByRole('button', { name: 'Messages' });
    fireEvent.focus(messages);
    expect(isExpanded()).toBe(true);
    fireEvent.click(messages);
    expect(screen.getByTestId('path').textContent).toBe('/app/messages');
    expect(isExpanded()).toBe(false);
  });

  it('holds while the class menu is open, and lets go once a class is picked', () => {
    renderAt('/app/home');
    hoverIn();
    openClassSwitcher();
    hoverOut();
    settle(SIDEBAR_HOVER.closeDelayMs + 1000);
    expect(isExpanded()).toBe(true);
    fireEvent.click(screen.getByText('Beta'));
    expect(isExpanded()).toBe(false);
  });

  it('is always open as the phone drawer', () => {
    const desktop = window.matchMedia;
    window.matchMedia = (query: string) => ({ ...desktop(query), matches: query.includes('max-width') });
    try {
      renderAt('/app/home');
      expect(isExpanded()).toBe(true);
    } finally {
      window.matchMedia = desktop;
    }
  });
});

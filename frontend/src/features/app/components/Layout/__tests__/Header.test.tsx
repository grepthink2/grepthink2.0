import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiNotification } from '@/lib/api';
import type { Class, ClassRole, School } from '@/lib/classContext';

const state = vi.hoisted(() => ({
  role: 'instructor' as ClassRole | null | undefined,
  preview: { isPreviewing: false, enterPreview: vi.fn(), exitPreview: vi.fn() },
  notifications: [] as ApiNotification[],
  ctx: {
    selectedClass: null as Class | null,
    classes: [] as Class[],
    setSelectedClass: vi.fn(),
    showSchoolSwitcher: false,
    schools: [] as School[],
    currentSchool: null as School | null,
    selectSchool: vi.fn(),
  },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ signOut: vi.fn(), user: null }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => state.preview }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => state.ctx,
  useSelectedClassRole: () => state.role,
}));
vi.mock('@features/notifications/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: state.notifications,
    unreadCount: state.notifications.length,
    loading: false,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  }),
}));
vi.mock('@/lib/api', () => ({ apiRequest: vi.fn() }));

import Header from '../Header';

const UCSC: School = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };
const IST: School = { id: 'ist', name: 'İstinye University', slug: 'istinye' };

function cls(id: string, name: string, my_role: ClassRole, institution: School): Class {
  return {
    id,
    name,
    course_code: `${id.toUpperCase()}-CODE`,
    created_by: my_role === 'instructor' ? 'me' : 'prof',
    created_at: '2026-01-01',
    my_role,
    institution,
  };
}

const taught = cls('alpha', 'Alpha', 'instructor', IST);
const assisted = cls('beta', 'Beta', 'ta', UCSC);

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Header onOpenSettings={vi.fn()} onToggleNav={vi.fn()} onOpenSearch={vi.fn()} onPrefetchSearch={vi.fn()} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Open the profile menu and return its rows' labels, in order. */
function openProfileMenu(): string[] {
  fireEvent.click(screen.getByRole('button', { name: 'Profile menu' }));
  const menu = screen.getByRole('menu', { name: 'Profile' });
  return Array.from(menu.querySelectorAll('[role^="menuitem"] .gt-menu__label')).map((label) => label.textContent ?? '');
}

beforeEach(() => {
  state.role = 'instructor';
  state.notifications = [];
  state.preview.isPreviewing = false;
  state.preview.enterPreview.mockReset();
  state.preview.exitPreview.mockReset();
  state.ctx.selectedClass = taught;
  state.ctx.classes = [taught, assisted];
  state.ctx.showSchoolSwitcher = false;
  state.ctx.schools = [IST, UCSC];
  state.ctx.currentSchool = IST;
});

describe('Header', () => {
  it('puts the School group first in the profile menu for an account at two or more schools', () => {
    state.ctx.showSchoolSwitcher = true;
    renderAt('/app/home');
    expect(openProfileMenu()).toEqual([
      'İstinye University',
      'UC Santa Cruz',
      'View class as student',
      'Settings',
      "What's new",
      'Log Out',
    ]);
    const menu = screen.getByRole('menu', { name: 'Profile' });
    expect(menu.firstElementChild).toBe(within(menu).getByRole('group', { name: 'School' }));
  });

  it('returns focus to the profile button after a school is picked', () => {
    state.ctx.showSchoolSwitcher = true;
    renderAt('/app/home');
    const profileButton = screen.getByRole('button', { name: 'Profile menu' });
    fireEvent.click(profileButton);
    const school = screen.getByRole('menuitemradio', { name: 'UC Santa Cruz' });
    school.focus(); // a keyboard user on the row
    fireEvent.click(school);
    expect(state.ctx.selectSchool).toHaveBeenCalledWith('ucsc');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(profileButton).toHaveFocus();
  });

  it.each(['View class as student', 'Settings'])(
    'returns focus to the profile button after "%s" closes the menu',
    (item) => {
      renderAt('/app/dashboard');
      const profileButton = screen.getByRole('button', { name: 'Profile menu' });
      fireEvent.click(profileButton);
      const option = screen.getByRole('menuitem', { name: item });
      option.focus(); // a keyboard user on the item
      fireEvent.click(option);
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(profileButton).toHaveFocus();
    },
  );

  it('offers "View class as student" in a class you own and starts the preview from Home', () => {
    renderAt('/app/dashboard');
    expect(openProfileMenu()).toEqual(['View class as student', 'Settings', "What's new", 'Log Out']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'View class as student' }));
    expect(state.preview.enterPreview).toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/app/home');
  });

  it('does not offer the preview in a class you TA', () => {
    state.role = 'ta';
    state.ctx.selectedClass = assisted;
    state.ctx.currentSchool = UCSC;
    renderAt('/app/home');
    expect(openProfileMenu()).toEqual(['Settings', "What's new", 'Log Out']);
  });

  it('offers "Instructor view" while previewing your class', () => {
    // The previewed class shows as a student's, but you still own it.
    state.role = 'student';
    state.preview.isPreviewing = true;
    renderAt('/app/my-project');
    openProfileMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Instructor view' }));
    expect(state.preview.exitPreview).toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/app/home');
  });

  it('shows the class details in a class you teach', () => {
    renderAt('/app/dashboard');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Access Code:')).toBeInTheDocument();
  });

  it('shows the student breadcrumbs and no class details in a class you TA', () => {
    state.role = 'ta';
    state.ctx.selectedClass = assisted;
    renderAt('/app/my-project');
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('My Project')).toBeInTheDocument();
    expect(screen.queryByText('Access Code:')).not.toBeInTheDocument();
  });

  it('names a person\'s page "Profile", whoever it shows', () => {
    renderAt('/app/people/00000000-0000-4000-8000-000000000001');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Profile');
  });

  it('names the Analytics page, which belongs to no class', () => {
    renderAt('/app/analytics');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Analytics');
    expect(screen.queryByText('Access Code:')).not.toBeInTheDocument();
  });
});

describe('Header — opening a join-request notification', () => {
  function notice(type: ApiNotification['type'], title: string): ApiNotification {
    return {
      id: `n-${type}`,
      type,
      title,
      body: 'S6 X requested to join Beta.',
      entity_type: 'project',
      entity_id: 'p2',
      read_at: null,
      created_at: '2026-10-09T10:00:00Z',
      class: null,
      team: null,
      actor: null,
      conversation: null,
      message_count: 1,
    };
  }

  it.each([
    // A team's own reviewers answer from the requests list on Home.
    ['join_request', 'New join request', '/app/home'],
    // The instructor is the only reviewer of a team with nobody to review: open that team.
    ['join_request_unreviewed', 'Join request needs your review', '/app/projects/p2'],
  ] as const)('%s opens %s', async (type, title, path) => {
    state.notifications = [notice(type, title)];
    renderAt('/app/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByText(title));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent(path));
  });
});

describe('Header — a document finalized', () => {
  it('opens the document by its id, which opens it under its project', async () => {
    state.notifications = [
      {
        id: 'n-doc',
        type: 'document_finalized',
        title: 'Document finalized',
        body: 'Trailhead finalized its Sprint 2 report',
        entity_type: 'document',
        entity_id: 'd1',
        read_at: null,
        created_at: '2026-11-17T10:00:00Z',
        class: null,
        team: null,
        actor: null,
        conversation: null,
        message_count: 1,
      },
    ];
    renderAt('/app/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByText('Document finalized'));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/app/documents/d1'));
  });
});

describe('Header — a late window opened', () => {
  it('opens the Assignments page of the class it names, with that class selected', async () => {
    // A student in Beta, looking at Alpha, is told a TSR in Beta takes late submissions.
    state.ctx.setSelectedClass.mockClear();
    state.notifications = [
      {
        id: 'n-late',
        type: 'late_window_opened',
        title: 'Late submissions open for TSR 3',
        body: 'You can submit until Nov 18, 2026 at 5:00 PM (PT)',
        entity_type: 'class',
        entity_id: 'beta',
        read_at: null,
        created_at: '2026-11-17T10:00:00Z',
        class: null,
        team: null,
        actor: null,
        conversation: null,
        message_count: 1,
      },
    ];
    renderAt('/app/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByText('Late submissions open for TSR 3'));
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/app/assignments'));
    expect(state.ctx.setSelectedClass).toHaveBeenCalledWith(assisted);
  });

  it('opens nothing for a class that is not in the list, rather than that page of the selected class', async () => {
    state.ctx.setSelectedClass.mockClear();
    state.notifications = [
      {
        id: 'n-late-gone',
        type: 'late_window_opened',
        title: 'Late submissions open for TSR 9',
        body: 'You can submit until Nov 18, 2026 at 5:00 PM (PT)',
        entity_type: 'class',
        entity_id: 'gamma',
        read_at: null,
        created_at: '2026-11-17T10:00:00Z',
        class: null,
        team: null,
        actor: null,
        conversation: null,
        message_count: 1,
      },
    ];
    renderAt('/app/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByText('Late submissions open for TSR 9'));
    // The list closes once the notice is read; then anything still queued lands before the check:
    // act flushes React's queued work, and the work that work queues, until none is left.
    await waitFor(() => expect(screen.queryByText('Late submissions open for TSR 9')).not.toBeInTheDocument());
    await act(async () => {});
    expect(screen.getByTestId('path').textContent).toBe('/app/dashboard');
    expect(state.ctx.setSelectedClass).not.toHaveBeenCalled();
  });
});

describe('Header — a message notification', () => {
  it('quotes the message without its formatting marks', async () => {
    state.notifications = [
      {
        id: 'n-message',
        type: 'message',
        title: 'New message from Sam Lee',
        body: '**Standup** moved to `3pm`',
        entity_type: 'conversation',
        entity_id: 'c1',
        read_at: null,
        created_at: '2026-10-11T10:00:00Z',
        class: null,
        team: null,
        actor: null,
        conversation: null,
        message_count: 1,
      },
    ];
    renderAt('/app/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    const item = screen.getByText('New message from Sam Lee').closest('button');
    // The parser loads with the first preview; the item shows the raw text until it has.
    await waitFor(() => expect(item).toHaveTextContent('Standup moved to 3pm'));
    expect(item?.querySelector('strong, code')).toBeNull();
  });
});

describe('Header — global search', () => {
  it('shows the ⌘K trigger where the search box was, and opens search on click', () => {
    const onOpenSearch = vi.fn();
    const onPrefetchSearch = vi.fn();
    render(
      <MemoryRouter initialEntries={['/app/home']}>
        <Header onOpenSettings={vi.fn()} onToggleNav={vi.fn()} onOpenSearch={onOpenSearch} onPrefetchSearch={onPrefetchSearch} />
      </MemoryRouter>,
    );
    expect(screen.queryByPlaceholderText('Search')).toBeNull();
    const trigger = screen.getByRole('button', { name: /^Search \((⌘|Ctrl) K\)$/ });
    fireEvent.mouseEnter(trigger);
    expect(onPrefetchSearch).toHaveBeenCalledTimes(1);
    fireEvent.click(trigger);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });
});

describe('Header height', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes its measured height on the app view, for content that sticks or scrolls under it', () => {
    let observe: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) {
        observe = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {
        disconnect();
      }
    });
    const { container, unmount } = render(
      <div className="app-view">
        <MemoryRouter initialEntries={['/app/home']}>
          <Header onOpenSettings={vi.fn()} onToggleNav={vi.fn()} onOpenSearch={vi.fn()} onPrefetchSearch={vi.fn()} />
        </MemoryRouter>
      </div>,
    );
    const view = container.querySelector('.app-view') as HTMLElement;
    const header = container.querySelector('header') as HTMLElement;
    act(() => observe([{ target: header, borderBoxSize: [{ blockSize: 88, inlineSize: 900 }] } as unknown as ResizeObserverEntry], {} as ResizeObserver));
    expect(view.style.getPropertyValue('--gt-app-header-h')).toBe('88px');
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(view.style.getPropertyValue('--gt-app-header-h')).toBe('');
  });
});

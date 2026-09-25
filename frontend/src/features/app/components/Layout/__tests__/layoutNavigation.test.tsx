/**
 * The layout with its real providers: PreviewProvider, ClassProvider, ClassRouteGuard, the Header,
 * the preview banner and the Sidebar. React Router navigates in a transition, so a preview or class
 * change must commit together with its navigation; committed first, it meets the class route guard
 * on the old page, which redirects from there.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClass, ApiNotification } from '@/lib/api';

const api = vi.hoisted(() => ({ getClasses: vi.fn(), updateClassStatus: vi.fn() }));
const apiRequest = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  canCreateClasses: true,
  notifications: [] as unknown[],
}));
vi.mock('@/lib/api', () => ({ api, apiRequest }));
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'me', user_metadata: {} },
    canCreateClasses: state.canCreateClasses,
    signOut: vi.fn(),
  }),
}));
vi.mock('@features/notifications/hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: state.notifications,
    unreadCount: state.notifications.length,
    loading: false,
    markRead: vi.fn(async () => {}),
    markAllRead: vi.fn(),
  }),
}));
vi.mock('@features/messages/hooks/useUnreadTotal', () => ({ useUnreadTotal: () => 0 }));

import { PreviewProvider } from '@/lib/previewContext';
import { ClassProvider, useClass } from '@/lib/classContext';
import ClassRouteGuard from '../ClassRouteGuard';
import Header from '../Header';
import PreviewBanner from '../PreviewBanner';
import Sidebar from '../Sidebar';

const UCSC = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };
const IST = { id: 'ist', name: 'İstinye University', slug: 'istinye' };

function cls(id: string, name: string, my_role: ApiClass['my_role'], extra: Partial<ApiClass> = {}): ApiClass {
  return {
    id,
    name,
    course_code: `${id}-CODE`,
    created_by: my_role === 'instructor' ? 'me' : 'prof',
    created_at: '2026-01-01',
    status: 'active',
    my_role,
    ...extra,
  };
}

/** Every page and selected class the page area committed with, in order. */
const commits: string[] = [];

function Page() {
  const { pathname } = useLocation();
  const classId = useClass().selectedClass?.id ?? 'none';
  useLayoutEffect(() => {
    commits.push(`${pathname} ${classId}`);
  }, [pathname, classId]);
  return <output data-testid="page">{pathname}</output>;
}

function App({ initial }: { initial: string }) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <PreviewProvider>
        <ClassProvider>
          <PreviewBanner />
          <Sidebar />
          <Header onOpenSettings={() => {}} onToggleNav={() => {}} />
          <ClassRouteGuard>
            <Routes>
              <Route path="*" element={<Page />} />
            </Routes>
          </ClassRouteGuard>
        </ClassProvider>
      </PreviewProvider>
    </MemoryRouter>
  );
}

const page = () => screen.queryByTestId('page')?.textContent;
const pagesVisited = () => commits.map((c) => c.split(' ')[0]);

async function start(initial: string, classes: ApiClass[]) {
  api.getClasses.mockResolvedValue({ classes });
  render(<App initial={initial} />);
  await waitFor(() => expect(page()).toBe(initial));
  commits.length = 0;
}

function pickFromProfileMenu(...names: (string | RegExp)[]) {
  fireEvent.click(screen.getByRole('button', { name: 'Profile menu' }));
  for (const name of names) fireEvent.click(screen.getByRole('button', { name }));
}

/** Waits for `path`, then lets anything still queued land before the caller checks the history. */
async function landsOn(path: string) {
  await waitFor(() => expect(page()).toBe(path));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(page()).toBe(path);
}

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
  localStorage.clear();
  commits.length = 0;
  state.canCreateClasses = true;
  state.notifications = [];
  apiRequest.mockResolvedValue({});
});
afterEach(() => vi.resetAllMocks());

describe('"View class as student"', () => {
  const taught = cls('A', 'Alpha', 'instructor');

  it('starts from the Dashboard and lands on Home', async () => {
    await start('/app/dashboard', [taught]);
    pickFromProfileMenu('View class as student');
    await landsOn('/app/home');
    expect(screen.getByText('Previewing as student')).toBeInTheDocument();
    expect(pagesVisited()).not.toContain('/app/my-project');
  });

  it('starts from Home and stays there', async () => {
    await start('/app/home', [taught]);
    pickFromProfileMenu('View class as student');
    await landsOn('/app/home');
    expect(screen.getByText('Previewing as student')).toBeInTheDocument();
  });

  it('ends with "Instructor view" on My Project and lands on Home', async () => {
    await start('/app/home', [taught]);
    pickFromProfileMenu('View class as student');
    await landsOn('/app/home');
    fireEvent.click(screen.getByText('My Project')); // the sidebar shows the student items
    await landsOn('/app/my-project');
    commits.length = 0;
    pickFromProfileMenu('Instructor view');
    await landsOn('/app/home');
    expect(screen.queryByText('Previewing as student')).not.toBeInTheDocument();
    expect(pagesVisited()).not.toContain('/app/dashboard');
  });

  it("ends with the banner's Exit preview on My Project and lands on Home", async () => {
    await start('/app/home', [taught]);
    pickFromProfileMenu('View class as student');
    await landsOn('/app/home');
    fireEvent.click(screen.getByText('My Project'));
    await landsOn('/app/my-project');
    commits.length = 0;
    fireEvent.click(screen.getByRole('button', { name: /exit preview/i }));
    await landsOn('/app/home');
    expect(screen.queryByText('Previewing as student')).not.toBeInTheDocument();
    expect(pagesVisited()).not.toContain('/app/dashboard');
  });
});

describe('switching class on a detail page', () => {
  it('never shows the detail page with the new class (sidebar class switcher)', async () => {
    state.canCreateClasses = false;
    await start('/app/assignments/asgA', [cls('A', 'Alpha', 'student'), cls('B', 'Beta', 'student')]);
    fireEvent.click(screen.getByRole('button', { name: /^Alpha/ }));
    fireEvent.click(screen.getByText('Beta'));
    await landsOn('/app/assignments');
    expect(commits).toEqual(['/app/assignments B']);
  });

  it('never shows the detail page with the new class (profile-menu school switcher)', async () => {
    await start('/app/modules/tsr/t1', [
      cls('A', 'Alpha', 'instructor', { institution: IST }),
      cls('B', 'Beta', 'ta', { institution: UCSC }),
    ]);
    pickFromProfileMenu(/^School:/, 'UC Santa Cruz');
    await landsOn('/app/ta-meetings');
    expect(commits).toEqual(['/app/ta-meetings B']);
  });
});

describe('opening a notification for another class', () => {
  it('lands on the page it links to, not where the guard would send the old page', async () => {
    // A TA in one class (on TA Review there) who teaches another is asked to upload its roster.
    state.notifications = [
      {
        id: 'n1',
        type: 'upload_roster',
        title: 'Upload your roster',
        body: 'Beta has no roster yet.',
        entity_type: 'class',
        entity_id: 'B',
        read_at: null,
        created_at: '2026-09-25T10:00:00Z',
      } as unknown as ApiNotification,
    ];
    await start('/app/ta-review', [cls('A', 'Alpha', 'ta'), cls('B', 'Beta', 'instructor')]);
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    fireEvent.click(screen.getByText('Upload your roster'));
    await landsOn('/app/roster');
    expect(pagesVisited()).not.toContain('/app/dashboard');
  });
});

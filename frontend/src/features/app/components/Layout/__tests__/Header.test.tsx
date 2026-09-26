import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Class, ClassRole, School } from '@/lib/classContext';

const state = vi.hoisted(() => ({
  role: 'instructor' as ClassRole | null | undefined,
  preview: { isPreviewing: false, enterPreview: vi.fn(), exitPreview: vi.fn() },
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
    notifications: [],
    unreadCount: 0,
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
      <Header onOpenSettings={vi.fn()} onToggleNav={vi.fn()} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Open the profile menu and return its items' labels, in order. */
function openProfileMenu(): string[] {
  fireEvent.click(screen.getByRole('button', { name: 'Profile menu' }));
  const menu = document.querySelector<HTMLElement>('.app-header__profile-dropdown');
  if (!menu) throw new Error('profile menu did not open');
  return within(menu)
    .getAllByRole('button')
    .map((button) => button.textContent ?? '');
}

beforeEach(() => {
  state.role = 'instructor';
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
  it('puts the school row first in the profile menu for an account at two or more schools', () => {
    state.ctx.showSchoolSwitcher = true;
    renderAt('/app/home');
    expect(openProfileMenu()).toEqual([
      'School: İstinye University',
      'View class as student',
      'Settings',
      'Log Out',
    ]);
  });

  it('returns focus to the profile button after a school is picked', () => {
    state.ctx.showSchoolSwitcher = true;
    renderAt('/app/home');
    const profileButton = screen.getByRole('button', { name: 'Profile menu' });
    fireEvent.click(profileButton);
    fireEvent.click(screen.getByRole('button', { name: /^School:/ }));
    fireEvent.click(screen.getByRole('button', { name: 'UC Santa Cruz' }));
    expect(state.ctx.selectSchool).toHaveBeenCalledWith('ucsc');
    expect(document.querySelector('.app-header__profile-dropdown')).not.toBeInTheDocument();
    expect(profileButton).toHaveFocus();
  });

  it.each(['View class as student', 'Settings'])(
    'returns focus to the profile button after "%s" closes the menu',
    (item) => {
      renderAt('/app/dashboard');
      const profileButton = screen.getByRole('button', { name: 'Profile menu' });
      fireEvent.click(profileButton);
      const option = screen.getByRole('button', { name: item });
      option.focus(); // a keyboard user on the item
      fireEvent.click(option);
      expect(document.querySelector('.app-header__profile-dropdown')).not.toBeInTheDocument();
      expect(profileButton).toHaveFocus();
    },
  );

  it('offers "View class as student" in a class you own and starts the preview from Home', () => {
    renderAt('/app/dashboard');
    expect(openProfileMenu()).toEqual(['View class as student', 'Settings', 'Log Out']);
    fireEvent.click(screen.getByRole('button', { name: 'View class as student' }));
    expect(state.preview.enterPreview).toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/app/home');
  });

  it('does not offer the preview in a class you TA', () => {
    state.role = 'ta';
    state.ctx.selectedClass = assisted;
    state.ctx.currentSchool = UCSC;
    renderAt('/app/home');
    expect(openProfileMenu()).toEqual(['Settings', 'Log Out']);
  });

  it('offers "Instructor view" while previewing your class', () => {
    // The previewed class shows as a student's, but you still own it.
    state.role = 'student';
    state.preview.isPreviewing = true;
    renderAt('/app/my-project');
    openProfileMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Instructor view' }));
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
});

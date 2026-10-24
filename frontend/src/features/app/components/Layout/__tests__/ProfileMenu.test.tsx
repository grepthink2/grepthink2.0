import type { ComponentProps, ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { School } from '@/lib/classContext';
import { APP_VERSION } from '@features/releases/version';
import { SEEN_KEY } from '@features/releases/seenStore';

const UCSC: School = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };
const IST: School = { id: 'ist', name: 'İstinye University', slug: 'istinye' };

const state = vi.hoisted(() => ({
  signOut: vi.fn(),
  preview: { isPreviewing: false, enterPreview: vi.fn(), exitPreview: vi.fn() },
  ctx: {
    showSchoolSwitcher: false,
    schools: [] as { id: string; name: string; slug: string }[],
    currentSchool: null as { id: string; name: string; slug: string } | null,
    selectSchool: vi.fn(),
    selectedClass: { id: 'taught', my_role: 'instructor' } as { id: string; my_role: string } | null,
  },
  preload: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ signOut: state.signOut, user: null }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => state.preview }));
vi.mock('@/lib/classContext', () => ({ useClass: () => state.ctx }));
// A stand-in feed that shows the lastSeen its host hands it.
vi.mock('@features/releases/loadReleaseFeed', async () => {
  const { createElement } = await import('react');
  const FakeFeed = ({ lastSeen }: { lastSeen: string | null }) => createElement('p', null, `Feed since ${lastSeen ?? 'never'}`);
  return {
    loadReleaseFeed: () => Promise.resolve({ default: FakeFeed }),
    preloadReleaseFeed: state.preload,
  };
});

type Props = ComponentProps<typeof import('../ProfileMenu').default>;
let ProfileMenu: ComponentType<Props>;

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderAt(path = '/app/home', props: Partial<Props> = {}) {
  const onOpenSettings = vi.fn();
  render(
    <MemoryRouter initialEntries={[path]}>
      <ProfileMenu avatarUrl={null} onOpenSettings={onOpenSettings} {...props} />
      <button type="button">After</button>
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onOpenSettings };
}

const trigger = () => screen.getByRole('button', { name: 'Profile menu' });
const menu = () => screen.getByRole('menu', { name: 'Profile' });
const rows = () =>
  Array.from(menu().querySelectorAll<HTMLElement>('[role^="menuitem"]')).map(
    (row) => row.querySelector('.gt-menu__label')?.textContent,
  );

beforeEach(async () => {
  // A seen store per test, as on a page load; this test has read the notes, unless it says otherwise.
  localStorage.clear();
  localStorage.setItem(SEEN_KEY, APP_VERSION);
  vi.resetModules();
  state.signOut.mockReset();
  state.preload.mockReset();
  state.preview.isPreviewing = false;
  state.preview.enterPreview.mockReset();
  state.preview.exitPreview.mockReset();
  state.ctx.showSchoolSwitcher = false;
  state.ctx.schools = [IST, UCSC];
  state.ctx.currentSchool = IST;
  state.ctx.selectSchool.mockReset();
  state.ctx.selectedClass = { id: 'taught', my_role: 'instructor' };
  ProfileMenu = (await import('../ProfileMenu')).default;
});

afterEach(() => {
  localStorage.clear();
});

describe('ProfileMenu: the rows', () => {
  it('a student gets Settings, What\'s new and Log Out', async () => {
    state.ctx.selectedClass = { id: 'c', my_role: 'student' };
    renderAt();
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(rows()).toEqual(['Settings', "What's new", 'Log Out']);
    expect(screen.getByRole('menuitem', { name: 'Log Out' })).toHaveClass('gt-menu__item--destructive');
  });

  it('an instructor in their own class gets "View class as student" first', async () => {
    renderAt();
    await userEvent.click(trigger());
    expect(rows()).toEqual(['View class as student', 'Settings', "What's new", 'Log Out']);
  });

  it('offers "Instructor view" while previewing', async () => {
    state.preview.isPreviewing = true;
    renderAt();
    await userEvent.click(trigger());
    expect(rows()).toEqual(['Instructor view', 'Settings', "What's new", 'Log Out']);
  });

  it('puts the School group first for an account at two schools, the current one checked', async () => {
    state.ctx.showSchoolSwitcher = true;
    renderAt();
    await userEvent.click(trigger());
    expect(rows()).toEqual(['İstinye University', 'UC Santa Cruz', 'View class as student', 'Settings', "What's new", 'Log Out']);
    const group = within(menu()).getByRole('group', { name: 'School' });
    expect(within(group).getByRole('menuitemradio', { name: 'İstinye University' })).toHaveAttribute('aria-checked', 'true');
    expect(within(group).getByRole('menuitemradio', { name: 'UC Santa Cruz' })).toHaveAttribute('aria-checked', 'false');
    expect(group.nextElementSibling).toHaveAttribute('role', 'separator');
  });

  it('has no School group for an account at one school', async () => {
    renderAt();
    await userEvent.click(trigger());
    expect(within(menu()).queryByRole('group')).not.toBeInTheDocument();
  });
});

describe('ProfileMenu: keyboard and focus', () => {
  it('opens on the first row, and the arrow keys, Home and End move', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(trigger());
    expect(screen.getByRole('menuitem', { name: 'View class as student' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Settings' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Log Out' })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: "What's new" })).toHaveFocus();
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: 'View class as student' })).toHaveFocus();
  });

  it('closes on Esc with focus on the trigger', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(trigger());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('closes when Tab leaves the menu', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(trigger());
    await user.keyboard('{End}');
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('leaves focus where an outside click put it', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(trigger());
    await user.click(screen.getByRole('button', { name: 'After' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('a click on the trigger closes the open menu', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('warms the feed when the menu opens', async () => {
    renderAt();
    expect(state.preload).not.toHaveBeenCalled();
    await userEvent.click(trigger());
    expect(state.preload).toHaveBeenCalledTimes(1);
  });

  it.each(['View class as student', 'Settings'])('"%s" closes the menu with focus on the trigger', async (name) => {
    const user = userEvent.setup();
    const { onOpenSettings } = renderAt('/app/dashboard');
    await user.click(trigger());
    await user.click(screen.getByRole('menuitem', { name }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    if (name === 'Settings') expect(onOpenSettings).toHaveBeenCalledTimes(1);
    else {
      expect(state.preview.enterPreview).toHaveBeenCalled();
      expect(screen.getByTestId('path').textContent).toBe('/app/home');
    }
  });

  it('"Instructor view" leaves the preview from Home', async () => {
    state.preview.isPreviewing = true;
    renderAt('/app/my-project');
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Instructor view' }));
    expect(state.preview.exitPreview).toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/app/home');
  });
});

describe('ProfileMenu: schools', () => {
  beforeEach(() => {
    state.ctx.showSchoolSwitcher = true;
  });

  it('picks a school, closes with focus on the trigger, and lands on the page for the role there', async () => {
    state.ctx.selectSchool.mockReturnValue({ id: 'c1', my_role: 'ta' });
    renderAt('/app/dashboard');
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'UC Santa Cruz' }));
    expect(state.ctx.selectSchool).toHaveBeenCalledWith('ucsc');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
    expect(screen.getByTestId('path').textContent).toBe('/app/ta-meetings');
  });

  it('stays put when the pick keeps the class you are in', async () => {
    state.ctx.selectSchool.mockReturnValue(state.ctx.selectedClass);
    renderAt('/app/my-project');
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'İstinye University' }));
    expect(state.ctx.selectSchool).toHaveBeenCalledWith('ist');
    expect(screen.getByTestId('path').textContent).toBe('/app/my-project');
  });
});

describe("ProfileMenu: What's new", () => {
  it('describes the trigger and the row as new release notes while unseen, with the dot on the avatar', async () => {
    localStorage.clear();
    renderAt('/app/home', { avatarUrl: 'https://example.test/me.png' });
    expect(trigger()).toHaveAccessibleDescription('New release notes');
    expect(trigger().querySelector('.gt-profile-menu__avatar .gt-new-dot')).toHaveClass('gt-profile-menu__dot', 'gt-new-dot--ring');
    await userEvent.click(trigger());
    const row = screen.getByRole('menuitem', { name: "What's new" });
    expect(row).toHaveAccessibleDescription('New release notes');
    const marker = row.querySelector('.gt-menu__trailing .gt-badge');
    expect(marker).toHaveTextContent('New');
    expect(marker).toHaveClass('gt-badge--info', 'gt-badge--sm');
    expect(marker).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows no dot, marker or description once read', async () => {
    renderAt();
    expect(trigger()).not.toHaveAccessibleDescription();
    expect(trigger().querySelector('.gt-new-dot')).toBeNull();
    await userEvent.click(trigger());
    const row = screen.getByRole('menuitem', { name: "What's new" });
    expect(row).not.toHaveAccessibleDescription();
    expect(row.querySelector('.gt-menu__trailing')).toBeNull();
  });

  it.each([
    ['an earlier release', '0.90.0', 'Feed since 0.90.0'],
    ['nothing, on a first visit', null, 'Feed since never'],
  ])('hands the feed the release seen before this opening (%s), and keeps it while the modal is open', async (_, stored, text) => {
    localStorage.clear();
    if (stored) localStorage.setItem(SEEN_KEY, stored);
    renderAt();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitem', { name: "What's new" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(localStorage.getItem(SEEN_KEY)).toBe(APP_VERSION);
  });

  it('closes the menu, opens the light modal, and gives focus back to the profile button', async () => {
    localStorage.clear();
    const user = userEvent.setup();
    renderAt();
    await user.click(trigger());
    await user.keyboard('{End}{ArrowUp}{Enter}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: "What's new" });
    expect(dialog).not.toHaveClass('gt-modal--dark');
    expect(localStorage.getItem(SEEN_KEY)).toBe(APP_VERSION);
    expect(trigger()).not.toHaveAccessibleDescription();
    await waitFor(() => expect(within(dialog).getByRole('region', { name: 'Release notes' })).toHaveFocus());

    await user.keyboard('{Escape}');
    expect(trigger()).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(trigger());
    expect(screen.getByRole('menuitem', { name: "What's new" })).not.toHaveAccessibleDescription();
  });
});

describe('ProfileMenu: Log Out', () => {
  it('signs out, then goes to the landing page', async () => {
    let finish: () => void = () => {};
    state.signOut.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    renderAt('/app/home');
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole('menuitem', { name: 'Log Out' }));
    expect(state.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('path').textContent).toBe('/app/home');
    finish();
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/'));
  });
});

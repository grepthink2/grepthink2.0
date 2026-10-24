import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { cssRules } from '@/test/cssRules';
import '@/styles/tokens/spacing.css';
import { APP_VERSION } from '@features/releases/version';
import { SEEN_KEY } from '@features/releases/seenStore';

const mocks = vi.hoisted(() => ({ preload: vi.fn() }));
// The feed never arrives here: the modal's own tests cover it.
vi.mock('@features/releases/loadReleaseFeed', () => ({
  loadReleaseFeed: () => new Promise(() => {}),
  preloadReleaseFeed: mocks.preload,
}));

let WhatsNewTab: ComponentType;
let Header: ComponentType;

beforeEach(async () => {
  // A fresh seen store per test, as on a page load.
  localStorage.clear();
  vi.resetModules();
  mocks.preload.mockReset();
  WhatsNewTab = (await import('../components/WhatsNewTab')).default;
  Header = (await import('../components/Header')).default;
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

const tab = () => screen.getByRole('button', { name: "What's new" });
const dot = () => tab().querySelector('.gt-new-dot');

describe('WhatsNewTab', () => {
  it("is a button named What's new, described as new release notes and dotted while unseen", () => {
    render(<WhatsNewTab />);
    expect(tab()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(tab()).toHaveAccessibleDescription('New release notes');
    expect(tab()).toHaveClass('landing-header__link', 'landing-header__tab');
    expect(tab().querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(dot()).toHaveClass('gt-new-dot', 'gt-new-dot--ring');
  });

  it('opens the dark modal, records the version and drops the dot and the description', async () => {
    render(<WhatsNewTab />);
    await userEvent.click(tab());
    const dialog = screen.getByRole('dialog', { name: "What's new" });
    expect(dialog).toHaveClass('gt-modal--dark');
    expect(localStorage.getItem(SEEN_KEY)).toBe(APP_VERSION);
    expect(tab()).not.toHaveAccessibleDescription();
    expect(dot()).toBeNull();
  });

  it('closes on Esc with focus back on the tab', async () => {
    const user = userEvent.setup();
    render(<WhatsNewTab />);
    await user.click(tab());
    await waitFor(() => expect(screen.getByRole('dialog', { name: "What's new" })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(tab()).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('closes from the × with focus back on the tab', async () => {
    const user = userEvent.setup();
    render(<WhatsNewTab />);
    await user.click(tab());
    await user.click(within(screen.getByRole('dialog', { name: "What's new" })).getByRole('button', { name: 'Close' }));
    expect(tab()).toHaveFocus();
  });

  it('warms the feed on hover and on focus', () => {
    render(<WhatsNewTab />);
    fireEvent.mouseEnter(tab());
    expect(mocks.preload).toHaveBeenCalledTimes(1);
    fireEvent.focus(tab());
    expect(mocks.preload).toHaveBeenCalledTimes(2);
  });

  it('works when storage throws: the dot shows, the modal opens, and the dot clears', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    render(<WhatsNewTab />);
    expect(tab()).toHaveAccessibleDescription('New release notes');
    await userEvent.click(tab());
    expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument();
    expect(dot()).toBeNull();
  });

  it('shows the icon alone at 400px and below, under the same name', () => {
    render(<WhatsNewTab />);
    expect(tab()).toHaveTextContent("What's new");
    const [narrow] = cssRules('.landing-header__tab-text', 'max-width: 400px');
    expect(narrow.getPropertyValue('display')).toBe('none');
    const [hit] = cssRules('.landing-header__tab::after');
    expect(hit.getPropertyValue('width')).toBe('max(100%, 44px)');
    expect(hit.getPropertyValue('height')).toBe('max(100%, 44px)');
  });
});

describe('the landing header', () => {
  const renderHeader = () =>
    render(
      <MemoryRouter>
        <Header />
      </MemoryRouter>,
    );

  it('puts the tab between Features and Contact', () => {
    renderHeader();
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const items = Array.from(nav.children).map((el) => el.getAttribute('aria-label') ?? el.textContent);
    expect(items).toEqual(['Features', "What's new", 'Contact', 'Sign in', 'Get started']);
  });

  it('sits below the modal: the chrome layer, under --gt-z-modal', () => {
    renderHeader();
    expect(cssRules('.landing-header')[0].getPropertyValue('z-index')).toBe('var(--gt-z-sidebar)');
    const root = cssRules(':root').find((rule) => rule.getPropertyValue('--gt-z-modal'));
    const layer = (name: string) => Number(root?.getPropertyValue(name).trim());
    expect(layer('--gt-z-sidebar')).toBeLessThan(layer('--gt-z-modal'));
  });

  it('keeps hiding Features at 560px and below', () => {
    renderHeader();
    const [phone] = cssRules('.landing-header__link--features', 'max-width: 560px');
    expect(phone.getPropertyValue('display')).toBe('none');
  });
});

import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { APP_VERSION } from '../version';
import type { ReleaseFeedProps } from '../components/ReleaseFeed';

type FeedModule = { default: ComponentType<ReleaseFeedProps> };

const mocks = vi.hoisted(() => ({
  load: vi.fn<() => Promise<FeedModule>>(),
  reloadPage: vi.fn(),
}));
vi.mock('../loadReleaseFeed', () => ({ loadReleaseFeed: () => mocks.load(), preloadReleaseFeed: vi.fn() }));
vi.mock('@/lib/reloadPage', () => ({ reloadPage: mocks.reloadPage }));

let WhatsNewModal: typeof import('../components/WhatsNewModal').WhatsNewModal;

/** A feed import the test settles itself. */
function deferredFeed() {
  let resolve: (module: FeedModule) => void = () => {};
  let reject: (error: Error) => void = () => {};
  mocks.load.mockReturnValue(
    new Promise<FeedModule>((res, rej) => {
      resolve = res;
      reject = rej;
    }),
  );
  return { resolve, reject };
}

function FakeFeed({ lastSeen, tone }: ReleaseFeedProps) {
  return <p>Feed since {lastSeen ?? 'never'}, {tone}</p>;
}

beforeEach(async () => {
  // lazy() keeps the first result it gets, so every test starts from a fresh module.
  vi.resetModules();
  mocks.load.mockReset();
  mocks.reloadPage.mockReset();
  ({ WhatsNewModal } = await import('../components/WhatsNewModal'));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WhatsNewModal', () => {
  it('is a modal dialog named "What\'s new" and described by the version', () => {
    deferredFeed();
    render(<WhatsNewModal open onClose={vi.fn()} tone="light" lastSeen={null} />);
    const dialog = screen.getByRole('dialog', { name: "What's new" });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(`Version ${APP_VERSION}`);
    expect(dialog).toHaveClass('gt-modal--md', 'gt-whats-new');
  });

  it('shows the loading state until the feed arrives, then the feed with the lastSeen it was given', async () => {
    const feed = deferredFeed();
    render(<WhatsNewModal open onClose={vi.fn()} tone="light" lastSeen="0.90.0" />);
    const dialog = screen.getByRole('dialog', { name: "What's new" });
    const busy = dialog.querySelector('[aria-busy="true"]');
    expect(busy).toHaveClass('gt-release-feed', 'gt-release-feed--loading');
    const status = within(dialog).getByRole('status');
    expect(status).toHaveTextContent('Loading release notes');
    // Outside the busy region, which assistive tech may hold back until it settles.
    expect(busy?.contains(status)).toBe(false);

    await act(async () => feed.resolve({ default: FakeFeed }));
    expect(await screen.findByText('Feed since 0.90.0, light')).toBeInTheDocument();
    expect(dialog.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('offers a reload when the feed does not load, inside the modal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const feed = deferredFeed();
    render(<WhatsNewModal open onClose={vi.fn()} tone="light" lastSeen={null} />);
    await act(async () => feed.reject(new TypeError('Failed to fetch dynamically imported module')));

    const dialog = screen.getByRole('dialog', { name: "What's new" });
    expect(await within(dialog).findByText("The release notes didn't load.")).toBeInTheDocument();
    const reload = within(dialog).getByRole('button', { name: 'Reload' });
    expect(reload).toHaveClass('gt-button--primary', 'gt-button--sm');
    await userEvent.click(reload);
    expect(mocks.reloadPage).toHaveBeenCalledTimes(1);
  });

  it('takes the dark look with tone="dark", and passes it to the feed', async () => {
    const feed = deferredFeed();
    render(<WhatsNewModal open onClose={vi.fn()} tone="dark" lastSeen={null} />);
    const dialog = screen.getByRole('dialog', { name: "What's new" });
    expect(dialog).toHaveClass('gt-modal--dark');
    expect(dialog.querySelector('.gt-release-feed--loading')).toHaveClass('gt-release-feed--dark');
    await act(async () => feed.resolve({ default: FakeFeed }));
    expect(await screen.findByText('Feed since never, dark')).toBeInTheDocument();
  });

  it('keeps the light look with tone="light"', () => {
    deferredFeed();
    render(<WhatsNewModal open onClose={vi.fn()} tone="light" lastSeen={null} />);
    expect(screen.getByRole('dialog', { name: "What's new" })).not.toHaveClass('gt-modal--dark');
  });

  it('starts on the feed, a named scroll region that is in the Tab cycle with the ×', async () => {
    deferredFeed();
    const user = userEvent.setup();
    render(<WhatsNewModal open onClose={vi.fn()} tone="light" lastSeen={null} />);
    const region = screen.getByRole('region', { name: 'Release notes' });
    expect(region).toHaveClass('gt-modal__body');
    expect(region).toHaveAttribute('tabindex', '0');
    await waitFor(() => expect(region).toHaveFocus());
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab();
    expect(region).toHaveFocus();
  });

  it('closes from the × and from Esc', async () => {
    deferredFeed();
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WhatsNewModal open onClose={onClose} tone="light" lastSeen={null} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('renders nothing, and loads nothing, while closed', () => {
    render(<WhatsNewModal open={false} onClose={vi.fn()} tone="light" lastSeen={null} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.load).not.toHaveBeenCalled();
  });
});

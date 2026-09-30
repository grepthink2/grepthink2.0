import { act, render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getUnsubscribeInfo: vi.fn(), confirmUnsubscribe: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@features/auth/components/GradientBackGroundWrapper', () => ({ default: () => null }));

import Unsubscribe from '../Unsubscribe';

const INVALID = "This unsubscribe link isn't valid. It may be incomplete.";
const UNAVAILABLE = "We couldn't check your link right now. Try again in a minute.";
const STOP = "You'll stop getting these emails from GrepThink.";
const REMINDERS = { valid: true, category: 'reminders', label: 'Deadline reminders' };
const DONE = { unsubscribed: true, category: 'reminders', label: 'Deadline reminders' };

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/unsubscribe" element={<Unsubscribe />} />
        <Route path="/" element={<p>the landing page</p>} />
      </Routes>
      {/* Another link to the same page, as an app navigation would open it. */}
      <Link to="/unsubscribe?token=second">another link</Link>
    </MemoryRouter>,
  );
}

const heading = () => screen.getByRole('heading', { level: 1 });
const unsubscribeButton = () => screen.getByRole('button', { name: 'Unsubscribe' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Unsubscribe', () => {
  it('says the link is incomplete, without asking the backend, when there is no token', () => {
    renderAt('/unsubscribe');

    expect(screen.getByText(INVALID)).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Unsubscribe');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(api.getUnsubscribeInfo).not.toHaveBeenCalled();
  });

  it('treats an empty token like a missing one', () => {
    renderAt('/unsubscribe?token=');

    expect(screen.getByText(INVALID)).toBeInTheDocument();
    expect(api.getUnsubscribeInfo).not.toHaveBeenCalled();
  });

  it('shows that it is checking the link until the backend answers', async () => {
    const answer = deferred<typeof REMINDERS>();
    api.getUnsubscribeInfo.mockReturnValue(answer.promise);
    renderAt('/unsubscribe?token=abc');

    expect(screen.getByText('Checking your link…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await act(async () => answer.resolve(REMINDERS));
    expect(screen.queryByText('Checking your link…')).not.toBeInTheDocument();
    expect(unsubscribeButton()).toBeInTheDocument();
  });

  it('passes the token to the backend as the address carries it', async () => {
    api.getUnsubscribeInfo.mockResolvedValue({ valid: false });
    renderAt('/unsubscribe?token=a%2Bb.c_d-e');

    await screen.findByText(INVALID);
    expect(api.getUnsubscribeInfo).toHaveBeenCalledTimes(1);
    expect(api.getUnsubscribeInfo).toHaveBeenCalledWith('a+b.c_d-e');
  });

  describe('a link the backend does not accept', () => {
    it('is not valid, and there is nothing to try again', async () => {
      api.getUnsubscribeInfo.mockResolvedValue({ valid: false });
      renderAt('/unsubscribe?token=stale');

      expect(await screen.findByText(INVALID)).toBeInTheDocument();
      expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(api.confirmUnsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('a link that could not be checked', () => {
    it('says so, not that the link is not valid, and offers Try again', async () => {
      api.getUnsubscribeInfo.mockResolvedValue(null);
      renderAt('/unsubscribe?token=abc');

      expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
      expect(screen.queryByText(INVALID)).not.toBeInTheDocument();
      expect(heading()).toHaveTextContent('Unsubscribe');
      expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();
      expect(api.confirmUnsubscribe).not.toHaveBeenCalled();
    });

    it('asks again on Try again, with focus on the heading, and then shows what the link is for', async () => {
      const user = userEvent.setup();
      const second = deferred<typeof REMINDERS>();
      api.getUnsubscribeInfo.mockResolvedValueOnce(null).mockReturnValueOnce(second.promise);
      renderAt('/unsubscribe?token=abc');

      await user.click(await screen.findByRole('button', { name: 'Try again' }));

      expect(api.getUnsubscribeInfo).toHaveBeenCalledTimes(2);
      expect(api.getUnsubscribeInfo).toHaveBeenLastCalledWith('abc');
      expect(screen.getByText('Checking your link…')).toBeInTheDocument();
      expect(screen.queryByText(UNAVAILABLE)).not.toBeInTheDocument();
      // The button is gone; focus stays on the page instead of dropping to the body.
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(heading()).toHaveFocus();

      await act(async () => second.resolve(REMINDERS));

      expect(screen.getByRole('heading', { level: 1, name: 'Unsubscribe from Deadline reminders?' })).toBeInTheDocument();
      expect(unsubscribeButton()).toBeEnabled();
      expect(heading()).toHaveFocus();
    });

    it('shows it again, with Try again, when the next check fails too', async () => {
      const user = userEvent.setup();
      api.getUnsubscribeInfo
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(REMINDERS);
      renderAt('/unsubscribe?token=abc');

      await user.click(await screen.findByRole('button', { name: 'Try again' }));
      expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
      expect(screen.queryByText(INVALID)).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(await screen.findByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
      expect(api.getUnsubscribeInfo).toHaveBeenCalledTimes(3);
    });
  });

  describe('a link the backend accepts', () => {
    it('asks what the reader is unsubscribing from before doing anything', async () => {
      api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
      renderAt('/unsubscribe?token=abc');

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Unsubscribe from Deadline reminders?' }),
      ).toBeInTheDocument();
      expect(screen.getByText(STOP)).toBeInTheDocument();
      expect(unsubscribeButton()).toBeEnabled();
      // Opening the link is not enough: a mail scanner that follows it must not unsubscribe anyone.
      expect(api.confirmUnsubscribe).not.toHaveBeenCalled();
    });

    it('spells the category as the backend does, whatever its capitals', async () => {
      api.getUnsubscribeInfo.mockResolvedValue({ valid: true, category: 'reminders', label: 'TSR reminders' });
      api.confirmUnsubscribe.mockResolvedValue({ unsubscribed: true, category: 'reminders', label: 'TSR reminders' });
      const user = userEvent.setup();
      renderAt('/unsubscribe?token=abc');

      expect(await screen.findByRole('heading', { level: 1, name: 'Unsubscribe from TSR reminders?' })).toBeInTheDocument();
      expect(screen.getByText(STOP)).toBeInTheDocument();

      await user.click(unsubscribeButton());

      expect(
        await screen.findByText("You're unsubscribed from TSR reminders. You can turn these emails back on in Settings."),
      ).toBeInTheDocument();
    });

    it('unsubscribes on confirm, with the button disabled while it is pending, then says so', async () => {
      const user = userEvent.setup();
      const pending = deferred<typeof DONE>();
      api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
      api.confirmUnsubscribe.mockReturnValue(pending.promise);
      renderAt('/unsubscribe?token=abc');

      await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));

      expect(api.confirmUnsubscribe).toHaveBeenCalledTimes(1);
      expect(api.confirmUnsubscribe).toHaveBeenCalledWith('abc');
      expect(screen.getByRole('button', { name: 'Unsubscribing…' })).toBeDisabled();

      await act(async () => pending.resolve(DONE));

      expect(
        screen.getByText("You're unsubscribed from Deadline reminders. You can turn these emails back on in Settings."),
      ).toBeInTheDocument();
      expect(heading()).toHaveTextContent('Unsubscribed');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('moves focus to the heading as the button is disabled, and leaves it there once it is answered', async () => {
      const user = userEvent.setup();
      const pending = deferred<typeof DONE>();
      api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
      api.confirmUnsubscribe.mockReturnValue(pending.promise);
      renderAt('/unsubscribe?token=abc');
      const button = await screen.findByRole('button', { name: 'Unsubscribe' });
      act(() => button.focus());
      expect(button).toHaveFocus();

      await user.keyboard('{Enter}');

      expect(screen.getByRole('button', { name: 'Unsubscribing…' })).toBeDisabled();
      expect(heading()).toHaveFocus();

      await act(async () => pending.resolve(DONE));

      // The button is gone now; focus did not drop to the body.
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(heading()).toHaveTextContent('Unsubscribed');
      expect(heading()).toHaveFocus();
    });

    it('shows the error and keeps the button when unsubscribing fails', async () => {
      const user = userEvent.setup();
      api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
      api.confirmUnsubscribe.mockRejectedValue(new Error("This unsubscribe link isn't valid."));
      renderAt('/unsubscribe?token=abc');

      await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));

      expect(await screen.findByRole('alert')).toHaveTextContent("This unsubscribe link isn't valid.");
      expect(unsubscribeButton()).toBeEnabled();
      expect(heading()).toHaveTextContent('Unsubscribe from Deadline reminders?');
      expect(screen.queryByText(/you're unsubscribed/i)).not.toBeInTheDocument();
      // Focus stayed on the page, one Tab from the button.
      expect(heading()).toHaveFocus();
    });

    it('clears the error when the reader tries again, and can then succeed', async () => {
      const user = userEvent.setup();
      api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
      api.confirmUnsubscribe
        .mockRejectedValueOnce(new Error('Could not unsubscribe. Try again later.'))
        .mockResolvedValueOnce(DONE);
      renderAt('/unsubscribe?token=abc');

      await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not unsubscribe. Try again later.');

      await user.click(unsubscribeButton());

      expect(await screen.findByText(/you're unsubscribed from deadline reminders/i)).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(api.confirmUnsubscribe).toHaveBeenCalledTimes(2);
    });
  });

  // Every state has a way out of the page, not only the first one that was written.
  const states: [string, (user: UserEvent) => Promise<void>][] = [
    ['there is no token', async () => void renderAt('/unsubscribe')],
    [
      'the link is being checked',
      async () => {
        api.getUnsubscribeInfo.mockReturnValue(new Promise(() => {}));
        renderAt('/unsubscribe?token=abc');
        await screen.findByText('Checking your link…');
      },
    ],
    [
      'the link is not valid',
      async () => {
        api.getUnsubscribeInfo.mockResolvedValue({ valid: false });
        renderAt('/unsubscribe?token=stale');
        await screen.findByText(INVALID);
      },
    ],
    [
      'the link could not be checked',
      async () => {
        api.getUnsubscribeInfo.mockResolvedValue(null);
        renderAt('/unsubscribe?token=abc');
        await screen.findByText(UNAVAILABLE);
      },
    ],
    [
      'the reader is asked to confirm',
      async () => {
        api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
        renderAt('/unsubscribe?token=abc');
        await screen.findByRole('button', { name: 'Unsubscribe' });
      },
    ],
    [
      'unsubscribing failed',
      async (user) => {
        api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
        api.confirmUnsubscribe.mockRejectedValue(new Error('Could not unsubscribe. Try again later.'));
        renderAt('/unsubscribe?token=abc');
        await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
        await screen.findByRole('alert');
      },
    ],
    [
      'the reader has unsubscribed',
      async (user) => {
        api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
        api.confirmUnsubscribe.mockResolvedValue(DONE);
        renderAt('/unsubscribe?token=abc');
        await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
        await screen.findByText(/you're unsubscribed/i);
      },
    ],
  ];

  it.each(states)('links back to GrepThink when %s', async (_state, reach) => {
    const user = userEvent.setup();
    await reach(user);

    const link = screen.getByRole('link', { name: 'Go to GrepThink' });
    expect(link).toHaveAttribute('href', '/');
    await user.click(link);
    expect(screen.getByText('the landing page')).toBeInTheDocument();
  });

  it('starts over for another link opened in the same page', async () => {
    const user = userEvent.setup();
    api.getUnsubscribeInfo.mockImplementation(async (token: string) =>
      token === 'second' ? { valid: true, category: 'digests', label: 'Unread message digests' } : REMINDERS,
    );
    api.confirmUnsubscribe.mockResolvedValue(DONE);
    renderAt('/unsubscribe?token=first');

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByText(/you're unsubscribed from deadline reminders/i)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'another link' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Unsubscribe from Unread message digests?' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/you're unsubscribed/i)).not.toBeInTheDocument();
  });
});

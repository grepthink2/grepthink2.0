import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ getUnsubscribeInfo: vi.fn(), confirmUnsubscribe: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@features/auth/components/GradientBackGroundWrapper', () => ({ default: () => null }));

import Unsubscribe from '../Unsubscribe';

const INVALID = "This unsubscribe link isn't valid. It may be incomplete.";
const REMINDERS = { valid: true, category: 'reminders', label: 'Deadline reminders' };

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

beforeEach(() => {
  vi.resetAllMocks();
});

describe('Unsubscribe', () => {
  it('says the link is incomplete, without asking the backend, when there is no token', () => {
    renderAt('/unsubscribe');

    expect(screen.getByText(INVALID)).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Unsubscribe');
    expect(screen.queryByRole('button', { name: /unsubscribe/i })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();

    await act(async () => answer.resolve(REMINDERS));
    expect(screen.queryByText('Checking your link…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeInTheDocument();
  });

  it('passes the token to the backend as the address carries it', async () => {
    api.getUnsubscribeInfo.mockResolvedValue({ valid: false });
    renderAt('/unsubscribe?token=a%2Bb.c_d-e');

    await screen.findByText(INVALID);
    expect(api.getUnsubscribeInfo).toHaveBeenCalledTimes(1);
    expect(api.getUnsubscribeInfo).toHaveBeenCalledWith('a+b.c_d-e');
  });

  it('says the link is not valid when the backend does not accept the token', async () => {
    api.getUnsubscribeInfo.mockResolvedValue({ valid: false });
    renderAt('/unsubscribe?token=stale');

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();
    expect(api.confirmUnsubscribe).not.toHaveBeenCalled();
  });

  it('says the link is not valid when the backend could not be asked', async () => {
    api.getUnsubscribeInfo.mockResolvedValue(null);
    renderAt('/unsubscribe?token=abc');

    expect(await screen.findByText(INVALID)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).not.toBeInTheDocument();
  });

  it('asks what the reader is unsubscribing from before doing anything', async () => {
    api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
    renderAt('/unsubscribe?token=abc');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Unsubscribe from Deadline reminders?' }),
    ).toBeInTheDocument();
    expect(screen.getByText("You'll stop getting deadline reminders from GrepThink.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled();
    // Opening the link is not enough: a mail scanner that follows it must not unsubscribe anyone.
    expect(api.confirmUnsubscribe).not.toHaveBeenCalled();
  });

  it('unsubscribes on confirm, with the button disabled while it is pending, then says so', async () => {
    const user = userEvent.setup();
    const pending = deferred<{ unsubscribed: boolean; category: string; label: string }>();
    api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
    api.confirmUnsubscribe.mockReturnValue(pending.promise);
    renderAt('/unsubscribe?token=abc');

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));

    expect(api.confirmUnsubscribe).toHaveBeenCalledTimes(1);
    expect(api.confirmUnsubscribe).toHaveBeenCalledWith('abc');
    expect(screen.getByRole('button', { name: 'Unsubscribing…' })).toBeDisabled();

    await act(async () =>
      pending.resolve({ unsubscribed: true, category: 'reminders', label: 'Deadline reminders' }),
    );

    expect(
      screen.getByText("You're unsubscribed from Deadline reminders. You can turn these emails back on in Settings."),
    ).toBeInTheDocument();
    expect(heading()).toHaveTextContent('Unsubscribed');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error and keeps the button when unsubscribing fails', async () => {
    const user = userEvent.setup();
    api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
    api.confirmUnsubscribe.mockRejectedValue(new Error("This unsubscribe link isn't valid."));
    renderAt('/unsubscribe?token=abc');

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("This unsubscribe link isn't valid.");
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Unsubscribe from Deadline reminders?');
    expect(screen.queryByText(/you're unsubscribed/i)).not.toBeInTheDocument();
  });

  it('clears the error when the reader tries again, and can then succeed', async () => {
    const user = userEvent.setup();
    api.getUnsubscribeInfo.mockResolvedValue(REMINDERS);
    api.confirmUnsubscribe
      .mockRejectedValueOnce(new Error('Could not unsubscribe. Try again later.'))
      .mockResolvedValueOnce({ unsubscribed: true, category: 'reminders', label: 'Deadline reminders' });
    renderAt('/unsubscribe?token=abc');

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not unsubscribe. Try again later.');

    await user.click(screen.getByRole('button', { name: 'Unsubscribe' }));

    expect(await screen.findByText(/you're unsubscribed from deadline reminders/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.confirmUnsubscribe).toHaveBeenCalledTimes(2);
  });

  it('links back to GrepThink from every state', async () => {
    const user = userEvent.setup();
    api.getUnsubscribeInfo.mockResolvedValue({ valid: false });
    renderAt('/unsubscribe?token=stale');
    await screen.findByText(INVALID);

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
    api.confirmUnsubscribe.mockResolvedValue({ unsubscribed: true, category: 'reminders', label: 'Deadline reminders' });
    renderAt('/unsubscribe?token=first');

    await user.click(await screen.findByRole('button', { name: 'Unsubscribe' }));
    expect(await screen.findByText(/you're unsubscribed from deadline reminders/i)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'another link' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Unsubscribe from Unread message digests?' }),
    ).toBeInTheDocument();
    expect(screen.getByText("You'll stop getting unread message digests from GrepThink.")).toBeInTheDocument();
    expect(screen.queryByText(/you're unsubscribed/i)).not.toBeInTheDocument();
  });
});

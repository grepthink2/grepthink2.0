/** Settings' Email section: one switch per category of optional email, saved as it is flipped. */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiEmailPreference } from '@/lib/api';

const session = vi.hoisted(() => ({
  user: { id: 'u1', email: 'ann@gmail.com', user_metadata: {} },
  canCreateClasses: false,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => session }));
vi.mock('@/lib/classContext', () => ({ useClass: () => ({ classes: [] }) }));
vi.mock('@/lib/institutions', () => ({ useInstitutions: () => [] }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock('@/lib/api', async () => {
  // The real error class: the section reads its status and detail.
  const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ApiError,
    apiRequest: vi.fn(),
    api: { checkEmail: vi.fn(), getEmailPreferences: vi.fn(), updateEmailPreferences: vi.fn() },
  };
});

import { api, apiRequest, ApiError } from '@/lib/api';
import Settings from '../Settings';

const REMINDERS: ApiEmailPreference = {
  category: 'reminders',
  label: 'Deadline reminders',
  description: 'Emails before a TSR or another deadline closes.',
  enabled: true,
};
const DIGESTS: ApiEmailPreference = {
  category: 'digests',
  label: 'Unread message digests',
  description: 'A daily email when messages have been waiting over an hour.',
  enabled: true,
};
const PROFILE = { id: 'u1', email: 'ann@gmail.com', role: 'student', first_name: 'Ann', last_name: 'Lee' };

const LOAD_FAILED = "Couldn't load your email settings.";
const SAVE_FAILED = "Couldn't save that change. Try again.";

/** The 503 the backend answers with before its preferences migration is applied. */
const unavailable = () =>
  new ApiError(503, 'Email preferences are not available yet', 'Request failed with status 503');

/**
 * A failed request, and the text the reader should see for it: the backend's own for a 400 or a
 * 503 that has some, `null` (the section's fixed line) for everything else.
 */
const FAILURES: [string, () => Error, string | null][] = [
  ['a 503 with its text', unavailable, 'Email preferences are not available yet'],
  [
    'a 400 with its text',
    () => new ApiError(400, 'Unknown email category: x', 'Request failed with status 400'),
    'Unknown email category: x',
  ],
  [
    'a 500 with a server message',
    () => new ApiError(500, 'Internal server error', 'Request failed with status 500', 'internal_error'),
    null,
  ],
  ['a 500 with no text', () => new ApiError(500, undefined, 'Request failed with status 500'), null],
  ['a 503 with no text', () => new ApiError(503, undefined, 'Request failed with status 503'), null],
  ['a 404', () => new ApiError(404, 'Not Found', 'Request failed with status 404'), null],
  ['a network failure', () => new TypeError('Failed to fetch'), null],
  ['a missing session', () => new Error('No authentication token available'), null],
];

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const reminders = () => screen.getByRole('switch', { name: 'Deadline reminders' });
const digests = () => screen.getByRole('switch', { name: 'Unread message digests' });
const navItem = (name: string) => screen.getByRole('button', { name });

/**
 * Browsers may drop focus from a control that becomes disabled; jsdom leaves it there (and will
 * not blur a disabled control), so focus is sent through the Profile item and blurred to stand in
 * for that: it ends on the document body, as a browser leaves it.
 */
function dropFocusFrom(control: HTMLElement) {
  act(() => {
    navItem('Profile').focus();
    navItem('Profile').blur();
  });
  expect(document.body).toHaveFocus();
  expect(control).not.toHaveFocus();
}

/** Opens Settings and switches to the Email section. */
async function openEmailSection() {
  const user = userEvent.setup();
  render(<Settings isOpen onClose={() => {}} />);
  await user.click(navItem('Email'));
  return user;
}

describe('Settings — Email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiRequest).mockImplementation((endpoint: string) =>
      Promise.resolve(endpoint === '/api/profiles/me' ? PROFILE : {}),
    );
    vi.mocked(api.getEmailPreferences).mockResolvedValue({ preferences: [REMINDERS, DIGESTS] });
  });

  describe('the section', () => {
    it('starts on Profile and only reads the preferences when Email is opened', async () => {
      render(<Settings isOpen onClose={() => {}} />);

      expect(navItem('Profile')).toHaveAttribute('aria-current', 'true');
      expect(navItem('Profile')).toHaveClass('settings-modal__nav-item--active');
      expect(navItem('Email')).not.toHaveAttribute('aria-current');
      expect(navItem('Email')).not.toHaveClass('settings-modal__nav-item--active');
      expect(await screen.findByLabelText('First Name')).toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(api.getEmailPreferences).not.toHaveBeenCalled();
    });

    it('lists each category as a labelled switch with its description, on or off as saved', async () => {
      vi.mocked(api.getEmailPreferences).mockResolvedValue({ preferences: [REMINDERS, { ...DIGESTS, enabled: false }] });
      await openEmailSection();

      expect(await screen.findByRole('switch', { name: 'Deadline reminders' })).toBeChecked();
      expect(reminders()).toHaveAccessibleDescription(REMINDERS.description);
      expect(digests()).not.toBeChecked();
      expect(digests()).toHaveAccessibleDescription(DIGESTS.description);
      expect(screen.getByRole('heading', { name: 'Email' })).toBeInTheDocument();
      expect(
        screen.getByText('Choose which emails GrepThink sends you. Class invites and verification codes are always sent.'),
      ).toBeInTheDocument();
    });

    it('marks Email as the current section and leaves out the profile form and its Save button', async () => {
      await openEmailSection();
      await screen.findByRole('switch', { name: 'Deadline reminders' });

      expect(navItem('Email')).toHaveAttribute('aria-current', 'true');
      expect(navItem('Email')).toHaveClass('settings-modal__nav-item--active');
      expect(navItem('Profile')).not.toHaveAttribute('aria-current');
      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('First Name')).not.toBeInTheDocument();
    });

    it('brings the profile form and its Save button back, with what was typed, when Profile is chosen again', async () => {
      const user = userEvent.setup();
      render(<Settings isOpen onClose={() => {}} />);
      const firstName = await screen.findByLabelText('First Name');
      await waitFor(() => expect(firstName).toHaveValue('Ann'));
      await user.clear(firstName);
      await user.type(firstName, 'Annabel');

      await user.click(navItem('Email'));
      await screen.findByRole('switch', { name: 'Deadline reminders' });
      await user.click(navItem('Profile'));

      expect(screen.getByLabelText('First Name')).toHaveValue('Annabel');
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    });

    it('reads the saved preferences again on every visit', async () => {
      const user = await openEmailSection();
      await screen.findByRole('switch', { name: 'Deadline reminders' });

      await user.click(navItem('Profile'));
      await user.click(navItem('Email'));

      expect(await screen.findByRole('switch', { name: 'Deadline reminders' })).toBeInTheDocument();
      expect(api.getEmailPreferences).toHaveBeenCalledTimes(2);
    });
  });

  describe('loading', () => {
    it('says it is loading until the preferences arrive', async () => {
      const answer = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.getEmailPreferences).mockReturnValue(answer.promise);
      await openEmailSection();

      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();

      await act(async () => answer.resolve({ preferences: [REMINDERS, DIGESTS] }));
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
      expect(reminders()).toBeInTheDocument();
    });

    it('shows why it could not load, offers Try again, and reads them again when asked', async () => {
      vi.mocked(api.getEmailPreferences)
        .mockRejectedValueOnce(unavailable())
        .mockResolvedValueOnce({ preferences: [REMINDERS, DIGESTS] });
      const user = await openEmailSection();

      expect(await screen.findByRole('alert')).toHaveTextContent('Email preferences are not available yet');
      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await screen.findByRole('switch', { name: 'Deadline reminders' })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(api.getEmailPreferences).toHaveBeenCalledTimes(2);
    });

    it.each(FAILURES)('tells the reader only what is fit to read when loading fails with %s', async (_case, failure, shown) => {
      vi.mocked(api.getEmailPreferences).mockRejectedValue(failure());
      await openEmailSection();

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe(shown ?? LOAD_FAILED);
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('moves focus to the heading when Try again is pressed, and leaves it there', async () => {
      const second = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.getEmailPreferences).mockRejectedValueOnce(unavailable()).mockReturnValueOnce(second.promise);
      const user = await openEmailSection();

      await user.click(await screen.findByRole('button', { name: 'Try again' }));

      // The button is gone; focus did not drop to the page.
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Email' })).toHaveFocus();

      await act(async () => second.resolve({ preferences: [REMINDERS, DIGESTS] }));

      expect(reminders()).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Email' })).toHaveFocus();
    });

    it('goes back to loading while Try again waits, and can fail again', async () => {
      const second = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.getEmailPreferences)
        .mockRejectedValueOnce(unavailable())
        .mockReturnValueOnce(second.promise);
      const user = await openEmailSection();
      await screen.findByRole('alert');

      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(screen.getByRole('status')).toHaveTextContent('Loading…');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await act(async () => second.reject(new ApiError(503, 'Still not available', 'Request failed with status 503')));
      expect(await screen.findByRole('alert')).toHaveTextContent('Still not available');
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    });

    it('does not show an answer that arrives after leaving the section', async () => {
      const answer = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.getEmailPreferences).mockReturnValue(answer.promise);
      const user = await openEmailSection();

      await user.click(navItem('Profile'));
      await act(async () => answer.resolve({ preferences: [REMINDERS, DIGESTS] }));

      expect(screen.queryByRole('switch')).not.toBeInTheDocument();
      expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    });
  });

  describe('flipping a switch', () => {
    it('saves { category: enabled } and keeps the list the backend answers with', async () => {
      vi.mocked(api.updateEmailPreferences).mockResolvedValue({
        preferences: [{ ...REMINDERS, enabled: false }, DIGESTS],
      });
      const user = await openEmailSection();

      await user.click(await screen.findByRole('switch', { name: 'Deadline reminders' }));

      expect(api.updateEmailPreferences).toHaveBeenCalledTimes(1);
      expect(api.updateEmailPreferences).toHaveBeenCalledWith({ reminders: false });
      await waitFor(() => expect(reminders()).toBeEnabled());
      expect(reminders()).not.toBeChecked();
      expect(digests()).toBeChecked();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('turns a switch back on with { category: true }', async () => {
      vi.mocked(api.getEmailPreferences).mockResolvedValue({ preferences: [REMINDERS, { ...DIGESTS, enabled: false }] });
      vi.mocked(api.updateEmailPreferences).mockResolvedValue({ preferences: [REMINDERS, DIGESTS] });
      const user = await openEmailSection();

      await user.click(await screen.findByRole('switch', { name: 'Unread message digests' }));

      expect(api.updateEmailPreferences).toHaveBeenCalledWith({ digests: true });
      await waitFor(() => expect(digests()).toBeEnabled());
      expect(digests()).toBeChecked();
    });

    it('can be flipped from its label', async () => {
      vi.mocked(api.updateEmailPreferences).mockResolvedValue({
        preferences: [REMINDERS, { ...DIGESTS, enabled: false }],
      });
      const user = await openEmailSection();
      await screen.findByRole('switch', { name: 'Deadline reminders' });

      await user.click(screen.getByText('Unread message digests'));

      expect(api.updateEmailPreferences).toHaveBeenCalledWith({ digests: false });
      await waitFor(() => expect(digests()).not.toBeChecked());
    });

    it('shows the change at once and disables the switches until the save is answered', async () => {
      const save = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.updateEmailPreferences).mockReturnValue(save.promise);
      const user = await openEmailSection();

      await user.click(await screen.findByRole('switch', { name: 'Deadline reminders' }));

      expect(reminders()).not.toBeChecked();
      expect(reminders()).toBeDisabled();
      // One save at a time: its answer is the whole list.
      expect(digests()).toBeDisabled();

      await act(async () => save.resolve({ preferences: [{ ...REMINDERS, enabled: false }, DIGESTS] }));

      expect(reminders()).toBeEnabled();
      expect(digests()).toBeEnabled();
    });

    it('takes the backend\'s list over what it showed, including categories changed elsewhere', async () => {
      vi.mocked(api.updateEmailPreferences).mockResolvedValue({
        preferences: [{ ...REMINDERS, enabled: false }, { ...DIGESTS, enabled: false }],
      });
      const user = await openEmailSection();

      await user.click(await screen.findByRole('switch', { name: 'Deadline reminders' }));

      await waitFor(() => expect(digests()).not.toBeChecked());
      expect(reminders()).not.toBeChecked();
    });

    it('puts the switch back and shows the error when the save fails', async () => {
      vi.mocked(api.updateEmailPreferences).mockRejectedValue(unavailable());
      const user = await openEmailSection();

      await user.click(await screen.findByRole('switch', { name: 'Deadline reminders' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Email preferences are not available yet');
      expect(reminders()).toBeChecked();
      expect(reminders()).toBeEnabled();
      expect(digests()).toBeChecked();
      expect(digests()).toBeEnabled();
    });

    it.each(FAILURES)('puts the switch back and tells the reader only what is fit to read when saving fails with %s', async (_case, failure, shown) => {
      vi.mocked(api.updateEmailPreferences).mockRejectedValue(failure());
      const user = await openEmailSection();

      await user.click(await screen.findByRole('switch', { name: 'Deadline reminders' }));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toBe(shown ?? SAVE_FAILED);
      expect(reminders()).toBeChecked();
      expect(reminders()).toBeEnabled();
    });

    it('clears the error when the next save starts', async () => {
      vi.mocked(api.updateEmailPreferences)
        .mockRejectedValueOnce(unavailable())
        .mockResolvedValueOnce({ preferences: [REMINDERS, { ...DIGESTS, enabled: false }] });
      const user = await openEmailSection();

      await user.click(await screen.findByRole('switch', { name: 'Deadline reminders' }));
      await screen.findByRole('alert');
      await user.click(digests());

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
      await waitFor(() => expect(digests()).not.toBeChecked());
      expect(reminders()).toBeChecked();
    });

    it('keeps the keyboard user on the switch they flipped, even if the browser blurred it while disabled', async () => {
      const save = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.updateEmailPreferences).mockReturnValue(save.promise);
      const user = await openEmailSection();
      const control = await screen.findByRole('switch', { name: 'Deadline reminders' });
      act(() => control.focus());

      await user.keyboard(' ');
      expect(control).toBeDisabled();
      dropFocusFrom(control);

      await act(async () => save.resolve({ preferences: [{ ...REMINDERS, enabled: false }, DIGESTS] }));

      expect(control).toBeEnabled();
      expect(control).not.toBeChecked();
      expect(control).toHaveFocus();
    });

    it('keeps the keyboard user on the switch after a failed save too', async () => {
      const save = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.updateEmailPreferences).mockReturnValue(save.promise);
      const user = await openEmailSection();
      const control = await screen.findByRole('switch', { name: 'Unread message digests' });
      act(() => control.focus());

      await user.keyboard(' ');
      dropFocusFrom(control);
      await act(async () => save.reject(unavailable()));

      expect(await screen.findByRole('alert')).toHaveTextContent('Email preferences are not available yet');
      expect(control).toBeChecked();
      expect(control).toHaveFocus();
    });

    it('leaves focus where the user moved it while the save was pending', async () => {
      const save = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.updateEmailPreferences).mockReturnValue(save.promise);
      const user = await openEmailSection();
      const control = await screen.findByRole('switch', { name: 'Deadline reminders' });
      act(() => control.focus());

      await user.keyboard(' ');
      act(() => navItem('Email').focus());
      await act(async () => save.resolve({ preferences: [{ ...REMINDERS, enabled: false }, DIGESTS] }));

      expect(control).toBeEnabled();
      expect(navItem('Email')).toHaveFocus();
      expect(control).not.toHaveFocus();
    });

    it('does not pull focus onto a switch that was flipped without having it', async () => {
      const save = deferred<{ preferences: ApiEmailPreference[] }>();
      vi.mocked(api.updateEmailPreferences).mockReturnValue(save.promise);
      await openEmailSection();
      const control = await screen.findByRole('switch', { name: 'Deadline reminders' });
      const other = navItem('Profile');
      act(() => other.focus());

      // An element's own click() flips the switch without focusing it.
      await act(async () => control.click());
      expect(api.updateEmailPreferences).toHaveBeenCalledTimes(1);
      await act(async () => save.resolve({ preferences: [{ ...REMINDERS, enabled: false }, DIGESTS] }));

      expect(control).not.toHaveFocus();
      expect(other).toHaveFocus();
    });
  });
});

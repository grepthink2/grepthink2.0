/** The Roster page's invite flow: what the invite modal says when queueing the invite fails. */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRosterStudent } from '@/lib/api';

const CLASS = vi.hoisted(() => ({
  id: 'c1',
  name: 'CSE 115C',
  course_code: 'ABC123',
  created_by: 'me',
  created_at: '2026-01-01',
}));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: CLASS }),
  useSelectedClassRole: () => 'instructor',
}));
vi.mock('@/lib/api', async () => {
  // The real error class: the page reads its status.
  const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ApiError,
    api: { getClassRoster: vi.fn(), queueInvite: vi.fn(), cancelInvite: vi.fn() },
  };
});
// Charts are not what is under test, and recharts needs a layout engine.
vi.mock('@features/app/components/Roster/PieCharts', () => ({ default: () => null }));

import { api, ApiError } from '@/lib/api';
import Roster from '../Roster';

const REFUSED =
  "Couldn't queue the invite. Remove any pasted images, keep the subject on one line, and invite at most 500 students at a time.";

const ADA: ApiRosterStudent = {
  id: 's1',
  name: 'Ada Lovelace',
  email: 'ada@ucsc.edu',
  class_status: 'enrolled',
  grepthink_status: 'not_registered',
  projects: [],
};

/** What FastAPI sends for a request that fails validation: `detail` is a list of field errors. */
const FIELD_ERRORS = [
  { type: 'string_too_long', loc: ['body', 'custom_body_html'], msg: 'String should have at most 100000 characters' },
];
const refusal = () => new ApiError(422, FIELD_ERRORS, 'Request failed with status 422');

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Opens the page, then the invite modal for the one student who is not registered. */
async function openInviteModal() {
  const user = userEvent.setup();
  render(<Roster />);
  // Enabled once the roster has loaded and one student is not registered.
  const inviteAll = await screen.findByRole('button', { name: /Invite All Not Registered/ });
  await waitFor(() => expect(inviteAll).toBeEnabled());
  await user.click(inviteAll);
  const dialog = await screen.findByRole('dialog', { name: 'Send Invitation Emails' });
  return { user, dialog };
}

const sendButton = () => screen.getByRole('button', { name: 'Send 1 invitation' });

describe('Roster — sending invitations', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(api.getClassRoster).mockResolvedValue({ students: [ADA], uploaded_at: null });
  });

  it('tells the instructor how to fix an invite the backend refuses with a 422', async () => {
    vi.mocked(api.queueInvite).mockRejectedValue(refusal());
    const { user, dialog } = await openInviteModal();

    await user.click(sendButton());

    const alert = await within(dialog).findByRole('alert');
    expect(alert.textContent).toBe(REFUSED);
    // Not the client's wording of a validation error, and the modal stays open to be fixed.
    expect(screen.queryByText(/Request failed with status 422/)).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Send Invitation Emails' })).toBeInTheDocument();
    expect(sendButton()).toBeEnabled();
  });

  it('maps a 422 whatever its detail is', async () => {
    vi.mocked(api.queueInvite).mockRejectedValue(new ApiError(422, 'Unprocessable entity', 'Request failed with status 422'));
    const { user, dialog } = await openInviteModal();

    await user.click(sendButton());

    expect((await within(dialog).findByRole('alert')).textContent).toBe(REFUSED);
  });

  it.each([
    [
      'a 503 with its text',
      () => new ApiError(503, 'The service is temporarily unavailable. Please try again in a moment.', 'Request failed with status 503'),
      'The service is temporarily unavailable. Please try again in a moment.',
    ],
    [
      'a 403 with its text',
      () => new ApiError(403, 'Only the class instructor can invite students', 'Request failed with status 403'),
      'Only the class instructor can invite students',
    ],
    ['a 500 with no text', () => new ApiError(500, undefined, 'Request failed with status 500'), 'Request failed with status 500'],
    ['a network failure', () => new TypeError('Failed to fetch'), 'Failed to fetch'],
    ['a failure that is not an Error', () => 'boom', 'Failed to send invitations'],
  ])('leaves %s as it was', async (_case, failure, shown) => {
    vi.mocked(api.queueInvite).mockRejectedValue(failure());
    const { user, dialog } = await openInviteModal();

    await user.click(sendButton());

    expect((await within(dialog).findByRole('alert')).textContent).toBe(shown);
  });

  it('clears the message when the instructor sends again', async () => {
    const second = deferred<{ job_id: string; send_at: string }>();
    vi.mocked(api.queueInvite).mockRejectedValueOnce(refusal()).mockReturnValueOnce(second.promise);
    const { user, dialog } = await openInviteModal();
    await user.click(sendButton());
    await within(dialog).findByRole('alert');

    await user.click(sendButton());

    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => second.resolve({ job_id: 'j1', send_at: '2026-09-30T12:01:00Z' }));
  });

  it('closes the modal and offers Unsend when the invite is queued', async () => {
    vi.mocked(api.queueInvite).mockResolvedValue({ job_id: 'j1', send_at: '2026-09-30T12:01:00Z' });
    const { user } = await openInviteModal();

    await user.click(sendButton());

    expect(await screen.findByText('1 invitation queued.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Unsend/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Send Invitation Emails' })).not.toBeInTheDocument();
    expect(api.queueInvite).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.queueInvite).mock.calls[0].slice(0, 2)).toEqual(['c1', ['ada@ucsc.edu']]);
  });
});

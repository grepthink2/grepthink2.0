import { render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiIncomingJoinRequest, ApiProjectJoinRequest } from '@/lib/api';
import RequestsModal from '../RequestsModal';

vi.mock('@/lib/api', () => ({
  api: {
    getIncomingJoinRequests: vi.fn(),
    getPendingTeamInvites: vi.fn(),
    getMyJoinRequests: vi.fn(),
    acceptProjectJoinRequest: vi.fn(),
    rejectProjectJoinRequest: vi.fn(),
    dismissJoinRequest: vi.fn(),
  },
}));

// Imported after the mock so this binding is the mocked module.
import { api } from '@/lib/api';

// Grace asks to join Robot Arm; the viewer's own request to join Weather Station was denied.
const GRACE_JOIN_REQUEST: ApiIncomingJoinRequest = {
  request_id: 'request-1',
  user_id: 'user-2',
  email: 'grace.hopper@ucsc.edu',
  status: 'pending',
  project_id: 'project-1',
  project_name: 'Robot Arm',
  member_count: 2,
};
const DENIED_REQUEST: ApiProjectJoinRequest = {
  request_id: 'request-2',
  user_id: 'user-1',
  status: 'rejected',
  project_id: 'project-2',
  project_name: 'Weather Station',
  member_count: 3,
};

const ACCEPT_ERROR = 'Could not accept this request. Please try again.';

function requestsModal(isOpen: boolean) {
  return <RequestsModal isOpen={isOpen} onClose={() => {}} classId="class-1" />;
}

/** Clicks a request's button, whose action fails, and waits for the reload that follows. */
async function failAction(user: UserEvent, button: string) {
  await user.click(await screen.findByRole('button', { name: button }));
  // The button reads "Accepting…" (or similar) until the reload after the failure is done.
  expect(await screen.findByRole('button', { name: button })).toBeEnabled();
  expect(api.getIncomingJoinRequests).toHaveBeenCalledTimes(2);
}

describe('RequestsModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Every load succeeds, the reload after a failed action included...
    vi.mocked(api.getIncomingJoinRequests).mockResolvedValue({ requests: [GRACE_JOIN_REQUEST] });
    vi.mocked(api.getPendingTeamInvites).mockResolvedValue({ requests: [] });
    vi.mocked(api.getMyJoinRequests).mockResolvedValue({ requests: [DENIED_REQUEST] });
    // ...and every action fails.
    vi.mocked(api.acceptProjectJoinRequest).mockRejectedValue(new Error('Request failed'));
    vi.mocked(api.rejectProjectJoinRequest).mockRejectedValue(new Error('Request failed'));
    vi.mocked(api.dismissJoinRequest).mockRejectedValue(new Error('Request failed'));
  });

  it.each([
    { tab: /Incoming/, button: 'Accept', error: ACCEPT_ERROR },
    { tab: /Incoming/, button: 'Decline', error: 'Could not decline this request. Please try again.' },
    { tab: /Outgoing/, button: 'Dismiss', error: 'Could not dismiss this request. Please try again.' },
  ])('keeps the error from a failed $button after the reload', async ({ tab, button, error }) => {
    const user = userEvent.setup();
    render(requestsModal(true));
    await user.click(screen.getByRole('tab', { name: tab }));

    await failAction(user, button);

    expect(screen.getByText(error)).toBeInTheDocument();
  });

  it('clears the error when the action is retried', async () => {
    vi.mocked(api.acceptProjectJoinRequest)
      .mockRejectedValueOnce(new Error('Request failed'))
      .mockResolvedValue({ message: 'Request accepted', user_id: 'user-2' });
    const user = userEvent.setup();
    render(requestsModal(true));
    await failAction(user, 'Accept');
    expect(screen.getByText(ACCEPT_ERROR)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept' }));

    expect(await screen.findByText('No incoming requests right now.')).toBeInTheDocument();
    expect(screen.queryByText(ACCEPT_ERROR)).not.toBeInTheDocument();
  });

  it('clears the error when the modal is opened again', async () => {
    const user = userEvent.setup();
    const { rerender } = render(requestsModal(true));
    await failAction(user, 'Accept');
    expect(screen.getByText(ACCEPT_ERROR)).toBeInTheDocument();

    rerender(requestsModal(false));
    rerender(requestsModal(true));

    await screen.findByRole('button', { name: 'Accept' });
    expect(screen.queryByText(ACCEPT_ERROR)).not.toBeInTheDocument();
  });
});

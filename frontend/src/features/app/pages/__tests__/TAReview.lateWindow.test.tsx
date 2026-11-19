/**
 * TA Review shows the chosen assignment's deadline and late window, and a TA the instructor lets
 * set it opens, moves or removes the window from there.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiAssignment } from '@/lib/api';
import { formatDeadline, formatInstant, formatInstantIn } from '@/lib/dateUtils';
import { zoneLabel } from '@features/schedule/scheduleModel';
import LateWindowModal, { type LateWindowModalProps } from '@features/app/components/TAReview/LateWindowModal';

const CLASS = vi.hoisted(() => ({
  id: 'c1',
  name: 'CSE 115C',
  created_by: 'prof',
  created_at: '2026-09-01',
  my_role: 'ta',
  institution: { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' },
  institution_id: 'ucsc',
}));
/** The viewer's zone and the school's, both fixed offsets. */
const zones = vi.hoisted(() => ({ viewer: 'Etc/GMT+8', school: 'Etc/GMT+8' }));

vi.mock('@/lib/classContext', () => ({ useClass: () => ({ selectedClass: CLASS }) }));
vi.mock('@/lib/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ApiError, api: { getTAReviewTargets: vi.fn(), setAssignmentLateWindow: vi.fn() } };
});
vi.mock('@/lib/institutions', () => ({ useSchoolTimezone: () => zones.school }));
vi.mock('@features/schedule/scheduleModel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@features/schedule/scheduleModel')>()),
  viewerZone: () => zones.viewer,
}));
// In the app the form's code loads on its first open, and React holds a Suspense reveal back, so a
// check that no form shows could pass while one is still loading. Here it renders at once.
vi.mock('@/lib/lazyModal', () => ({
  lazyModal: (_load: unknown, isOpen: (props: LateWindowModalProps) => boolean) =>
    function LateWindowModalNow(props: LateWindowModalProps) {
      return isOpen(props) ? <LateWindowModal {...props} /> : null;
    },
}));
vi.mock('@features/app/components/TSRS/TSRView', () => ({
  default: ({ assignmentId }: { assignmentId: string }) => <div data-testid="tsr-view">{assignmentId}</div>,
}));

import { api, ApiError } from '@/lib/api';
import TAReview from '../TAReview';

// Local times, so the date picker's days are the same wherever the tests run. The clock is pinned
// to Nov 18, 2026, which the calendar opens on when the field is empty.
const NOW = new Date(2026, 10, 18, 12, 0);
/** The first moment after Nov 15: shown as "Nov 15, 2026 at 11:59 PM". */
const DUE_AT = new Date(2026, 10, 16, 0, 0).toISOString();
const WINDOW = new Date(2026, 10, 18, 17, 0).toISOString();

const TSR3: ApiAssignment = {
  id: 'a3',
  Title: 'TSR 3',
  open_date: '2026-11-09',
  close_date: '2026-11-15',
  status: 'publish',
  class_id: 'c1',
  assignment_type: 'tsr',
  due_at: DUE_AT,
  accept_until: null,
};
const TSR3_WINDOW: ApiAssignment = { ...TSR3, accept_until: WINDOW };
const TSR4: ApiAssignment = {
  ...TSR3,
  id: 'a4',
  Title: 'TSR 4',
  open_date: '2026-11-16',
  close_date: '2026-11-22',
  due_at: new Date(2026, 10, 23, 0, 0).toISOString(),
};
const TRAILHEAD = { id: 'p1', name: 'Trailhead' };
const NO_PROJECTS_HINT = /You have not been assigned to any projects yet/;
const OPEN_FORM = 'Accept late submissions…';

function serve({
  assignments = [TSR3, TSR4],
  projects = [TRAILHEAD],
  canExtend = true,
}: { assignments?: ApiAssignment[]; projects?: { id: string; name: string }[]; canExtend?: boolean } = {}) {
  vi.mocked(api.getTAReviewTargets).mockResolvedValue({ assignments, projects, can_extend_deadlines: canExtend });
}

async function renderPage() {
  render(
    <MemoryRouter initialEntries={['/app/ta-review']}>
      <Routes>
        <Route path="/app/ta-review" element={<TAReview />} />
        <Route path="/app/ta-review/:assignmentId" element={<TAReview />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'TA Review' });
}

/** The window line under the assignment picker. */
const windowLine = () => screen.getByText(/^Deadline/).closest('p') as HTMLElement;
/** The deadline as the page shows it, one minute before `due_at`. */
const shownDue = (a: ApiAssignment) => new Date(new Date(a.due_at!).getTime() - 60_000);
const formDialog = () => screen.getByRole('dialog', { name: 'Accept late submissions' });
const dayName = (day: Date) => (name: string) => name.startsWith(format(day, 'PPPP'));

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: OPEN_FORM }));
  return screen.findByRole('dialog', { name: 'Accept late submissions' });
}

/** Opens the field's calendar, picks `day`, sets `time` when given, and closes it with Done. */
async function pickTime(user: ReturnType<typeof userEvent.setup>, day: Date, time?: string) {
  await user.click(within(formDialog()).getByRole('button', { name: /^Accept late submissions until/ }));
  const calendar = await screen.findByRole('dialog', { name: 'Choose date' });
  await user.click(within(calendar).getByRole('button', { name: dayName(day) }));
  if (time) fireEvent.change(within(calendar).getByLabelText('Time'), { target: { value: time } });
  await user.click(within(calendar).getByRole('button', { name: 'Done' }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  zones.viewer = 'Etc/GMT+8';
  zones.school = 'Etc/GMT+8';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TA Review — the window line', () => {
  it('gives the deadline and the late window in the viewer’s zone', async () => {
    serve({ assignments: [TSR3_WINDOW, TSR4] });
    await renderPage();
    expect(windowLine().textContent).toBe(
      `Deadline ${formatDeadline(TSR3_WINDOW)} · Late submissions until ${formatInstant(WINDOW)}`,
    );
  });

  it('says when there is no late window, for whichever assignment is chosen', async () => {
    const user = userEvent.setup();
    serve();
    await renderPage();
    expect(windowLine().textContent).toBe(`Deadline ${formatDeadline(TSR3)} · No late window`);

    await user.selectOptions(screen.getByLabelText('TSR Assignment'), 'a4');
    await waitFor(() => expect(windowLine().textContent).toBe(`Deadline ${formatDeadline(TSR4)} · No late window`));
  });

  it('shows "Deadline —" alone for an assignment without a deadline', async () => {
    serve({ assignments: [{ ...TSR3, due_at: null }] });
    await renderPage();
    expect(windowLine().textContent).toBe('Deadline —');
  });

  it('follows each time with the campus time when the school’s zone differs', async () => {
    zones.school = 'Etc/GMT+10';
    serve({ assignments: [TSR3_WINDOW] });
    await renderPage();
    const due = shownDue(TSR3_WINDOW);
    const until = new Date(WINDOW);
    expect(windowLine().textContent).toBe(
      `Deadline ${formatDeadline(TSR3_WINDOW)} (${formatInstantIn(due, 'Etc/GMT+10')} ${zoneLabel('Etc/GMT+10', due)})` +
        ` · Late submissions until ${formatInstant(WINDOW)} (${formatInstantIn(until, 'Etc/GMT+10')} ${zoneLabel('Etc/GMT+10', until)})`,
    );
  });
});

describe('TA Review — who sees what', () => {
  it('offers no late window control without the permission', async () => {
    serve({ canExtend: false });
    await renderPage();
    expect(windowLine()).toBeInTheDocument();
    expect(screen.getByTestId('tsr-view')).toHaveTextContent('a3');
    expect(screen.queryByRole('button', { name: OPEN_FORM })).not.toBeInTheDocument();
  });

  it('shows only the hint to a TA with no teams and without the permission', async () => {
    serve({ projects: [], canExtend: false });
    await renderPage();
    expect(screen.getByText(NO_PROJECTS_HINT)).toBeInTheDocument();
    expect(screen.queryByLabelText('TSR Assignment')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Deadline/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: OPEN_FORM })).not.toBeInTheDocument();
  });

  it('shows the assignments, the window and the control to a TA with the permission and no teams', async () => {
    serve({ projects: [] });
    await renderPage();
    expect(screen.getByLabelText('TSR Assignment')).toBeInTheDocument();
    expect(windowLine().textContent).toBe(`Deadline ${formatDeadline(TSR3)} · No late window`);
    expect(screen.getByRole('button', { name: OPEN_FORM })).toBeInTheDocument();
    expect(screen.getByText(NO_PROJECTS_HINT)).toBeInTheDocument();
    expect(screen.queryByTestId('tsr-view')).not.toBeInTheDocument();
  });

  it('says there are no TSR assignments to a TA with the permission when there are none', async () => {
    serve({ assignments: [], projects: [] });
    await renderPage();
    expect(screen.getByText('No TSR assignments exist for this class yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: OPEN_FORM })).not.toBeInTheDocument();
  });
});

describe('TA Review — the late window form', () => {
  it('saves the chosen time, and the line shows the window the server answers with', async () => {
    const user = userEvent.setup();
    serve();
    const saved = { ...TSR3, accept_until: '2026-11-21T01:00:00+00:00' };
    vi.mocked(api.setAssignmentLateWindow).mockResolvedValue(saved);
    await renderPage();
    const dialog = await openForm(user);
    expect(within(dialog).getByText('TSR 3')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Remove late window' })).not.toBeInTheDocument();

    await pickTime(user, new Date(2026, 10, 20), '17:00');
    await user.click(within(formDialog()).getByRole('button', { name: 'Save' }));

    expect(api.setAssignmentLateWindow).toHaveBeenCalledWith('a3', new Date(2026, 10, 20, 17, 0).toISOString());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(windowLine().textContent).toBe(
      `Deadline ${formatDeadline(saved)} · Late submissions until ${formatInstant(saved.accept_until)}`,
    );
  });

  it('starts from the current window', async () => {
    const user = userEvent.setup();
    serve({ assignments: [TSR3_WINDOW] });
    await renderPage();
    const dialog = await openForm(user);
    expect(within(dialog).getByRole('button', { name: /^Accept late submissions until/ })).toHaveAccessibleName(
      `Accept late submissions until ${format(new Date(WINDOW), 'MMM d, yyyy')} · 5:00 PM`,
    );
  });

  it('warns past 14 days after the deadline, and saves anyway', async () => {
    const user = userEvent.setup();
    serve();
    vi.mocked(api.setAssignmentLateWindow).mockResolvedValue({ ...TSR3, accept_until: '2026-11-30T16:00:00Z' });
    await renderPage();
    await openForm(user);

    // 13 days and 8 hours after the deadline: no warning.
    await pickTime(user, new Date(2026, 10, 29));
    expect(within(formDialog()).queryByText('More than 14 days after the deadline')).not.toBeInTheDocument();

    // 14 days and 8 hours after it.
    await pickTime(user, new Date(2026, 10, 30));
    expect(within(formDialog()).getByRole('status')).toHaveTextContent('More than 14 days after the deadline');
    await user.click(within(formDialog()).getByRole('button', { name: 'Save' }));
    expect(api.setAssignmentLateWindow).toHaveBeenCalledWith('a3', new Date(2026, 10, 30, 8, 0).toISOString());
  });

  it('refuses a time at the deadline without asking the server', async () => {
    const user = userEvent.setup();
    serve();
    await renderPage();
    await openForm(user);
    await pickTime(user, new Date(2026, 10, 16), '00:00');
    await user.click(within(formDialog()).getByRole('button', { name: 'Save' }));

    expect(within(formDialog()).getByRole('alert')).toHaveTextContent('Choose a time after the deadline');
    expect(api.setAssignmentLateWindow).not.toHaveBeenCalled();
  });

  it('refuses to save with no time chosen', async () => {
    const user = userEvent.setup();
    serve();
    await renderPage();
    await openForm(user);
    await user.click(within(formDialog()).getByRole('button', { name: 'Save' }));

    expect(within(formDialog()).getByRole('alert')).toHaveTextContent('Choose a time after the deadline');
    expect(api.setAssignmentLateWindow).not.toHaveBeenCalled();
  });

  it('removes the window once the TA confirms', async () => {
    const user = userEvent.setup();
    serve({ assignments: [TSR3_WINDOW] });
    vi.mocked(api.setAssignmentLateWindow).mockResolvedValue({ ...TSR3_WINDOW, accept_until: null });
    await renderPage();
    const dialog = await openForm(user);

    await user.click(within(dialog).getByRole('button', { name: 'Remove late window' }));
    const confirm = within(dialog).getByRole('group', {
      name: 'Remove the late window? Submissions close at the deadline again; anything already submitted stays.',
    });
    expect(api.setAssignmentLateWindow).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Remove late window' }));

    expect(api.setAssignmentLateWindow).toHaveBeenCalledWith('a3', null);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(windowLine().textContent).toBe(`Deadline ${formatDeadline(TSR3)} · No late window`);
  });

  it('keeps the window when the TA cancels the removal', async () => {
    const user = userEvent.setup();
    serve({ assignments: [TSR3_WINDOW] });
    await renderPage();
    const dialog = await openForm(user);

    await user.click(within(dialog).getByRole('button', { name: 'Remove late window' }));
    await user.click(within(within(dialog).getByRole('group')).getByRole('button', { name: 'Cancel' }));

    expect(within(dialog).queryByRole('group')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove late window' })).toBeInTheDocument();
    expect(api.setAssignmentLateWindow).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal in the form, which stays open', async () => {
    const user = userEvent.setup();
    serve();
    vi.mocked(api.setAssignmentLateWindow).mockRejectedValue(
      new ApiError(403, 'You may not change the late window of this assignment', 'Request failed'),
    );
    await renderPage();
    await openForm(user);
    await pickTime(user, new Date(2026, 10, 20), '17:00');
    await user.click(within(formDialog()).getByRole('button', { name: 'Save' }));

    expect(await within(formDialog()).findByRole('alert')).toHaveTextContent(
      'You may not change the late window of this assignment',
    );
    expect(windowLine().textContent).toBe(`Deadline ${formatDeadline(TSR3)} · No late window`);
  });

  it('closes on Cancel without saving', async () => {
    const user = userEvent.setup();
    serve();
    await renderPage();
    const dialog = await openForm(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.setAssignmentLateWindow).not.toHaveBeenCalled();
  });
});

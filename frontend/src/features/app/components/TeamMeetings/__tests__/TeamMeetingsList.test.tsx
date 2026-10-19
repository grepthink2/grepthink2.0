import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiProject } from '@/lib/api';
import EditProjectModal from '../../EditProject/EditProjectModal';
import { TeamMeetingsList, type TeamMeetingsListProps } from '../TeamMeetingsList';
import type { TeamMeeting } from '../teamMeetingsModel';

const LA = 'America/Los_Angeles';
const IST = 'Asia/Kolkata';

/** Tue Oct 20, 2026, 3:12 PM PT: the clock the design's demo is pinned to. */
const NOW = new Date('2026-10-20T22:12:00Z');

const SAVE_ERROR = 'Couldn’t save this meeting. Your changes are still here — try again.';
const LINK_ERROR = 'Enter the full link, like https://ucsc.zoom.us/j/…';

const meeting = (over: Partial<TeamMeeting> = {}): TeamMeeting => ({
  id: 'm1',
  projectId: 'p1',
  title: 'Sprint 3 planning',
  startsAt: '2026-10-22T22:00:00Z', // Thu Oct 22, 3:00 PM PT
  durationMinutes: 60,
  location: null,
  zoomUrl: null,
  note: null,
  createdBy: 'u-po',
  ...over,
});

/** Live at NOW: 3:00 – 4:00 PM PT on Tue Oct 20. */
const live = meeting({ id: 'm-live', title: 'Standup', startsAt: '2026-10-20T22:00:00Z', zoomUrl: 'https://ucsc.zoom.us/j/1' });
/** Ended the week before. */
const past = meeting({ id: 'm-past', title: 'Kickoff', startsAt: '2026-10-13T22:00:00Z', durationMinutes: 30 });

function renderManage(props: Partial<TeamMeetingsListProps> = {}) {
  return render(
    <TeamMeetingsList variant="manage" canManage now={NOW} zone={LA} schoolZone={LA} meetings={[]} {...props} />,
  );
}

const titleBox = () => screen.getByRole('textbox', { name: 'Title' });
const dateInput = () => screen.getByLabelText(/^Date/);
const timeInput = () => screen.getByLabelText(/^Start time/);

describe('TeamMeetingsList — the Meetings tab', () => {
  it('adds a meeting from the inline form', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderManage({ onCreate });

    expect(screen.getByText('No team meetings yet')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(screen.getByRole('heading', { name: 'New meeting' })).toBeInTheDocument();
    expect(titleBox()).toHaveFocus();
    await user.type(titleBox(), 'Design review');
    expect(screen.getByText('13/80')).toBeInTheDocument();
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    expect(screen.getByRole('combobox', { name: 'Duration' })).toHaveValue('60');
    await user.type(screen.getByRole('textbox', { name: 'Room' }), 'E2 room 180');
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith({
      title: 'Design review',
      startsAt: '2026-10-22T22:00:00.000Z',
      durationMinutes: 60,
      location: 'E2 room 180',
      zoomUrl: null,
      note: null,
    });
    expect(await screen.findByText('Meeting added.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'New meeting' })).not.toBeInTheDocument();
  });

  it('submits with Enter and sends the chosen duration, Zoom link and note', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderManage({ meetings: [meeting()], onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    fireEvent.change(dateInput(), { target: { value: '2026-10-23' } });
    fireEvent.change(timeInput(), { target: { value: '09:30' } });
    await user.selectOptions(screen.getByRole('combobox', { name: 'Duration' }), '45');
    await user.type(screen.getByRole('textbox', { name: 'Zoom link' }), ' https://ucsc.zoom.us/j/42 ');
    await user.type(screen.getByRole('textbox', { name: 'Note' }), 'Bring the demo');
    await user.type(titleBox(), 'Retro{Enter}');

    expect(onCreate).toHaveBeenCalledWith({
      title: 'Retro',
      startsAt: '2026-10-23T16:30:00.000Z',
      durationMinutes: 45,
      location: null,
      zoomUrl: 'https://ucsc.zoom.us/j/42',
      note: 'Bring the demo',
    });
  });

  it('says what is missing and focuses the first problem', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderManage({ onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Give the meeting a title.')).toBeInTheDocument();
    expect(screen.getByText('Pick a date.')).toBeInTheDocument();
    expect(screen.getByText('Pick a start time.')).toBeInTheDocument();
    expect(titleBox()).toHaveFocus();
    expect(titleBox()).toHaveAttribute('aria-invalid', 'true');
    expect(titleBox()).toHaveAccessibleDescription('Give the meeting a title.');

    // Typing in a field clears its error.
    await user.type(titleBox(), 'Retro');
    expect(screen.queryByText('Give the meeting a title.')).not.toBeInTheDocument();
  });

  it('refuses a start that has already passed when adding', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderManage({ onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.type(titleBox(), 'Too late');
    fireEvent.change(dateInput(), { target: { value: '2026-10-20' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText('That time has already passed.')).toBeInTheDocument();
    expect(timeInput()).toHaveFocus();
    expect(dateInput()).toHaveAttribute('min', '2026-10-20');
  });

  it('refuses a Zoom link the server would refuse, with the handoff’s copy', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderManage({ onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.type(titleBox(), 'Design review');
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    const zoom = screen.getByRole('textbox', { name: 'Zoom link' });
    // A space in the path: new URL() takes it, the API answers 422.
    await user.type(zoom, 'https://ucsc.zoom.us/j/1 2');
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(LINK_ERROR)).toBeInTheDocument();
    expect(zoom).toHaveFocus();

    await user.clear(zoom);
    await user.type(zoom, 'javascript:alert(1)');
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(LINK_ERROR)).toBeInTheDocument();
  });

  it('holds each field to the server’s length limits', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderManage({ onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    expect(titleBox()).toHaveAttribute('maxLength', '80');
    const room = screen.getByRole('textbox', { name: 'Room' });
    expect(room).toHaveAttribute('maxLength', '120');
    expect(screen.getByRole('textbox', { name: 'Zoom link' })).toHaveAttribute('maxLength', '500');
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveAttribute('maxLength', '500');

    // A value past maxLength (pasted by script, or an old row) still gets a field error.
    await user.type(titleBox(), 'Design review');
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    fireEvent.change(room, { target: { value: 'x'.repeat(121) } });
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Keep the room under 120 characters.')).toBeInTheDocument();
    expect(room).toHaveFocus();

    fireEvent.change(room, { target: { value: 'x'.repeat(120) } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Zoom link' }), {
      target: { value: `https://ucsc.zoom.us/j/${'1'.repeat(478)}` }, // 501 characters
    });
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.queryByText('Keep the room under 120 characters.')).not.toBeInTheDocument();
    expect(screen.getByText(LINK_ERROR)).toBeInTheDocument();
  });

  it('keeps what was typed and says so when saving fails', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error('500'));
    renderManage({ onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.type(titleBox(), 'Design review');
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(SAVE_ERROR);
    expect(titleBox()).toHaveValue('Design review');
    expect(screen.getByRole('button', { name: 'Add meeting' })).toBeEnabled();

    // A fresh form starts without the old error.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables the form and spins the button while saving', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onCreate = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderManage({ onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.type(titleBox(), 'Design review');
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    const submit = screen.getByRole('button', { name: 'Add meeting' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit.querySelector('.gt-button__spinner')).not.toBeNull();
    expect(titleBox()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    finish();
    expect(await screen.findByText('Meeting added.')).toBeInTheDocument();
  });

  it('edits a meeting in place and keeps a start that has passed', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    renderManage({ meetings: [meeting(), past], onUpdate });

    await user.click(screen.getByRole('button', { name: 'Edit Sprint 3 planning' }));
    expect(screen.getByRole('heading', { name: 'Edit meeting' })).toBeInTheDocument();
    expect(titleBox()).toHaveValue('Sprint 3 planning');
    expect(dateInput()).toHaveValue('2026-10-22');
    expect(timeInput()).toHaveValue('15:00');
    expect(dateInput()).not.toHaveAttribute('min');
    await user.clear(titleBox());
    await user.type(titleBox(), 'Sprint 3 planning (moved)');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onUpdate).toHaveBeenCalledWith('m1', {
      title: 'Sprint 3 planning (moved)',
      startsAt: '2026-10-22T22:00:00.000Z',
      durationMinutes: 60,
      location: null,
      zoomUrl: null,
      note: null,
    });
    expect(await screen.findByText('Meeting saved.')).toBeInTheDocument();

    // A meeting that already happened can still be corrected.
    await user.click(screen.getByRole('button', { name: 'Past (1)' }));
    await user.click(screen.getByRole('button', { name: 'Edit Kickoff' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.queryByText('That time has already passed.')).not.toBeInTheDocument();
    expect(onUpdate).toHaveBeenLastCalledWith('m-past', expect.objectContaining({ startsAt: '2026-10-13T22:00:00.000Z' }));
  });

  it('keeps one editor open at a time', async () => {
    const user = userEvent.setup();
    renderManage({ meetings: [meeting(), meeting({ id: 'm2', title: 'Demo', startsAt: '2026-10-23T22:00:00Z' })] });

    await user.click(screen.getByRole('button', { name: 'Edit Sprint 3 planning' }));

    expect(screen.getByRole('button', { name: 'Add meeting' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Demo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Demo' })).toBeDisabled();
  });

  it('asks before deleting and lands focus on Cancel', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    renderManage({ meetings: [meeting()], onDelete });

    await user.click(screen.getByRole('button', { name: 'Delete Sprint 3 planning' }));

    const question = "Delete 'Sprint 3 planning'? It disappears from your team's calendars.";
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: question })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('m1');
    expect(await screen.findByText('Meeting deleted.')).toBeInTheDocument();
  });

  it('says so in the strip when deleting fails, and Cancel puts the row back', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockRejectedValue(new Error('500'));
    renderManage({ meetings: [meeting()], onDelete });

    await user.click(screen.getByRole('button', { name: 'Delete Sprint 3 planning' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t delete. Try again.');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete Sprint 3 planning' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('lists upcoming meetings soonest first, the live one marked, and past ones behind a toggle', async () => {
    const user = userEvent.setup();
    renderManage({ meetings: [meeting({ zoomUrl: 'https://ucsc.zoom.us/j/9', location: 'E2 room 180', note: 'Bring estimates' }), past, live] });

    expect(screen.getByText('2 upcoming · 1 past')).toBeInTheDocument();
    const [first, second] = within(screen.getAllByRole('list')[0]).getAllByRole('listitem');
    expect(first).toHaveTextContent('Standup');
    expect(first).toHaveAttribute('aria-current', 'true');
    expect(within(first).getByText('Live')).toBeInTheDocument();
    expect(second).toHaveTextContent('Sprint 3 planning');
    expect(second).toHaveTextContent('Thu, Oct 22');
    expect(second).toHaveTextContent('3:00 – 4:00 PM');
    expect(within(second).getByText('1 h')).toHaveAttribute('datetime', 'PT1H');
    expect(within(second).getByText('E2 room 180')).toBeInTheDocument();
    expect(within(second).getByRole('link', { name: 'Zoom' })).toHaveAttribute('href', 'https://ucsc.zoom.us/j/9');
    expect(within(second).getByText('Bring estimates')).toHaveAttribute('title', 'Bring estimates');

    const toggle = screen.getByRole('button', { name: 'Past (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Kickoff')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const pastList = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(within(pastList).getByText('Kickoff').closest('li')).toHaveClass('gt-tm-row--past');
  });

  it('says No upcoming meetings when only past ones exist', () => {
    renderManage({ meetings: [past] });
    expect(screen.getByText('No upcoming meetings.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Past (1)' })).toBeInTheDocument();
  });

  it('shows skeleton rows while loading and a retry when loading fails', async () => {
    const user = userEvent.setup();
    const { rerender } = renderManage({ status: 'loading' });
    expect(screen.getByRole('status', { name: 'Loading team meetings' })).toHaveAttribute('aria-busy', 'true');

    const onRetry = vi.fn();
    rerender(<TeamMeetingsList variant="manage" canManage status="error" now={NOW} zone={LA} schoolZone={LA} onRetry={onRetry} />);
    expect(screen.getByText('Couldn’t load team meetings.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('reads times on the viewer’s clock and gives the campus time when the zones differ', async () => {
    const user = userEvent.setup();
    renderManage({ zone: IST, meetings: [meeting()] });

    expect(screen.getByText('Times in GMT+5:30 · campus is PT')).toBeInTheDocument();
    // 3:00 PM PT on Thu Oct 22 is 3:30 AM IST on Fri Oct 23.
    const row = screen.getByText('Sprint 3 planning').closest('li')!;
    expect(row).toHaveTextContent('Fri, Oct 23');
    expect(row.querySelector('.gt-tm-row__when')).toHaveAttribute('title', '3:00 – 4:00 PM PT');

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    expect(screen.getByText('2:30 AM PT on campus')).toBeInTheDocument();
    expect(timeInput()).toHaveAccessibleDescription('2:30 AM PT on campus');
  });
});

describe('TeamMeetingsList — the project-page card', () => {
  const card = (props: Partial<TeamMeetingsListProps> = {}) =>
    render(<TeamMeetingsList variant="card" now={NOW} zone={LA} schoolZone={LA} meetings={[]} {...props} />);

  it('shows upcoming meetings as compact schedule rows grouped by day', () => {
    const { container } = card({ meetings: [meeting(), live], teamName: 'Alpha', people: { 'u-po': { id: 'u-po', name: 'Ana Lopez' } } });

    const sched = container.querySelector('.gt-sched.gt-sched--compact')!;
    expect(sched).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Thursday' })).toBeInTheDocument();
    const rows = sched.querySelectorAll('ol.gt-sched__items > li.gt-sched-item--meeting');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Standup');
    expect(rows[0]).toHaveAttribute('aria-current', 'true');
    expect(within(rows[0] as HTMLElement).getByRole('link', { name: 'Join Zoom' })).toHaveAttribute('href', 'https://ucsc.zoom.us/j/1');
    expect(rows[1]).toHaveTextContent('Sprint 3 planning');
    expect(rows[1]).toHaveTextContent('Alpha');
    expect(within(rows[1] as HTMLElement).getByRole('img', { name: 'Ana Lopez' })).toHaveAttribute('title', 'Ana Lopez · Organizer');
  });

  it('keeps past meetings behind Past meetings (n)', async () => {
    const user = userEvent.setup();
    card({ meetings: [meeting(), past] });

    const toggle = screen.getByRole('button', { name: 'Past meetings (1)' });
    expect(screen.queryByText('Kickoff')).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Kickoff').closest('li')).toHaveClass('gt-sched-item--past');
  });

  it('shows the first few upcoming meetings, then a count of the rest', () => {
    const many = [1, 2, 3, 4, 5, 6, 7].map((n) =>
      meeting({ id: `m${n}`, title: `Meeting ${n}`, startsAt: `2026-10-2${n}T18:00:00Z` }),
    );
    card({ meetings: many, maxUpcoming: 5, scheduleHref: '/app/schedule' });

    expect(screen.getByText('Meeting 5')).toBeInTheDocument();
    expect(screen.queryByText('Meeting 6')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+2 more · See all in Schedule' })).toHaveAttribute('href', '/app/schedule');
  });

  it('gives the Product Owner a quiet Add one line when there are none', async () => {
    const user = userEvent.setup();
    const onManage = vi.fn();
    card({ canManage: true, onManage });

    expect(screen.getByText(/No team meetings yet\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add one' }));
    expect(onManage).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a member when there are none', () => {
    const { container } = card();
    expect(container).toBeEmptyDOMElement();
  });

  it('says so when only past meetings exist', () => {
    card({ meetings: [past] });
    expect(screen.getByText('No upcoming meetings.')).toBeInTheDocument();
  });

  it('notes the viewer’s zone once and keeps the campus time in each time’s title', () => {
    const { container } = card({ zone: IST, meetings: [meeting()] });
    expect(container.querySelector('.gt-sched__footer')).toHaveTextContent('Times in GMT+5:30 · campus is PT');
    expect(container.querySelector('.gt-sched-item__start')).toHaveAttribute('title', '3:00 – 4:00 PM PT');
  });

  it('shows skeleton rows while loading and a retry when loading fails', async () => {
    const user = userEvent.setup();
    const { rerender } = card({ status: 'loading' });
    expect(screen.getByRole('status', { name: 'Loading team meetings' })).toHaveAttribute('aria-busy', 'true');

    const onRetry = vi.fn();
    rerender(<TeamMeetingsList variant="card" status="error" now={NOW} zone={LA} schoolZone={LA} onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('TeamMeetingsList in the Edit Project modal', () => {
  const project = { id: 'p1', class_id: 'c1', name: 'Alpha', created_by: 'u-po' } as ApiProject;

  function renderModal(props: Partial<React.ComponentProps<typeof EditProjectModal>> = {}) {
    const onClose = vi.fn();
    render(
      <EditProjectModal
        isOpen
        onClose={onClose}
        project={project}
        projectMembers={[]}
        viewerIsProductOwner
        meetingsList={{ meetings: [meeting()], now: NOW, zone: LA, schoolZone: LA, onCreate: vi.fn(), onDelete: vi.fn() }}
        {...props}
      />,
    );
    return { onClose };
  }

  it('shows the Meetings tab only to the Product Owner', () => {
    const { unmount } = render(
      <EditProjectModal isOpen onClose={() => {}} project={project} projectMembers={[]} viewerIsProductOwner={false} />,
    );
    expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Team' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Meetings' })).not.toBeInTheDocument();
    unmount();

    renderModal();
    expect(screen.getByRole('button', { name: 'Meetings' })).toBeInTheDocument();
  });

  it('swaps Cancel and Save Changes for a single Done on the Meetings tab', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Meetings' }));

    expect(screen.getByRole('region', { name: 'Team meetings' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Project/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('opens on the Meetings tab when asked, and on Details for anyone else', () => {
    const { unmount } = render(
      <EditProjectModal isOpen onClose={() => {}} project={project} projectMembers={[]} viewerIsProductOwner initialTab="meetings" meetingsList={{ meetings: [], now: NOW, zone: LA, schoolZone: LA }} />,
    );
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    unmount();

    render(<EditProjectModal isOpen onClose={() => {}} project={project} projectMembers={[]} initialTab="meetings" />);
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Team meetings' })).not.toBeInTheDocument();
  });

  it('Escape closes the form without reaching the modal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Meetings' }));
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    expect(titleBox()).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('heading', { name: 'New meeting' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // With nothing open inside it, Escape still closes the modal.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Escape cancels a delete without reaching the modal', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: 'Meetings' }));
    await user.click(screen.getByRole('button', { name: 'Delete Sprint 3 planning' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByText(/It disappears from your team's calendars/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Sprint 3 planning' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiProject, ApiProjectMember } from '@/lib/api';

// Edit Project's Save Changes calls the API; nothing else here does.
const updateProject = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { updateProject } }));

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

/**
 * The Meetings tab over meetings kept in state, as the project page keeps them: a create adds the
 * meeting and resolves with it (`created` changes what comes back), an edit replaces the row's
 * fields, a delete drops the row.
 */
function StatefulList({ initial = [], created = {} }: { initial?: TeamMeeting[]; created?: Partial<TeamMeeting> }) {
  const [meetings, setMeetings] = useState(initial);
  return (
    <TeamMeetingsList
      variant="manage"
      canManage
      now={NOW}
      zone={LA}
      schoolZone={LA}
      meetings={meetings}
      onCreate={async (value) => {
        const added: TeamMeeting = { id: `new-${value.title}`, projectId: 'p1', ...value, ...created };
        setMeetings((current) => [...current, added]);
        return added;
      }}
      onUpdate={async (id, value) => {
        setMeetings((current) => current.map((m) => (m.id === id ? { ...m, ...value } : m)));
      }}
      onDelete={async (id) => {
        setMeetings((current) => current.filter((m) => m.id !== id));
      }}
    />
  );
}

/** Opens the New meeting form, fills in a title for Fri Oct 23 at `time`, and submits it. */
async function addMeeting(user: ReturnType<typeof userEvent.setup>, title: string, time = '10:00') {
  await user.click(screen.getByRole('button', { name: 'Add meeting' }));
  const form = screen.getByRole('form', { name: 'New meeting' });
  await user.type(titleBox(), title);
  fireEvent.change(dateInput(), { target: { value: '2026-10-23' } });
  fireEvent.change(timeInput(), { target: { value: time } });
  await user.click(within(form).getByRole('button', { name: 'Add meeting' }));
}

describe('TeamMeetingsList — the Meetings tab', () => {
  it('adds a meeting from the inline form', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderManage({ onCreate });

    expect(screen.getByText('No team meetings yet')).toBeInTheDocument();
    // Until the schedule and the calendar feed ship, the project page is where the team sees them.
    expect(
      screen.getByText('A design review, sprint planning, a sponsor demo — everyone on the team sees them on the project page.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(screen.getByRole('heading', { name: 'New meeting' })).toBeInTheDocument();
    expect(titleBox()).toHaveFocus();
    await user.type(titleBox(), 'Design review');
    expect(screen.getByText('13 / 80')).toBeInTheDocument();
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    expect(screen.getByRole('combobox', { name: 'Duration' })).toHaveValue('60');
    await user.type(screen.getByRole('textbox', { name: 'Room (optional)' }), 'E2 room 180');
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
    await user.type(screen.getByRole('textbox', { name: 'Zoom link (optional)' }), ' https://ucsc.zoom.us/j/42 ');
    await user.type(screen.getByRole('textbox', { name: 'Note (optional)' }), 'Bring the demo');
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
    // The title's counter is part of its description, after the error.
    expect(titleBox()).toHaveAccessibleDescription('Give the meeting a title. 0 of 80 characters');

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
    const zoom = screen.getByRole('textbox', { name: 'Zoom link (optional)' });
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

  it('holds each field to the server’s length limits, keeping what was typed past one', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    renderManage({ onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    // The limits are soft, as the shared fields keep them: nothing is cut, the field past its limit
    // is flagged, and the save waits for it.
    const room = screen.getByRole('textbox', { name: 'Room (optional)' });
    for (const field of [titleBox(), room, screen.getByRole('textbox', { name: 'Zoom link (optional)' }), screen.getByRole('textbox', { name: 'Note (optional)' })]) {
      expect(field).not.toHaveAttribute('maxLength');
    }

    fireEvent.change(titleBox(), { target: { value: 'x'.repeat(81) } });
    expect(titleBox()).toHaveValue('x'.repeat(81));
    expect(titleBox()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('81 / 80')).toBeInTheDocument();
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Keep it under 80 characters.')).toBeInTheDocument();
    expect(titleBox()).toHaveFocus();

    await user.clear(titleBox());
    await user.type(titleBox(), 'Design review');
    fireEvent.change(room, { target: { value: 'x'.repeat(121) } });
    expect(room).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('121 / 120')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText('Keep the room under 120 characters.')).toBeInTheDocument();
    expect(room).toHaveFocus();

    fireEvent.change(room, { target: { value: 'x'.repeat(120) } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Zoom link (optional)' }), {
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

  it('disables the form and keeps the busy button focused while saving', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onCreate = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderManage({ onCreate });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.type(titleBox(), 'Design review');
    fireEvent.change(dateInput(), { target: { value: '2026-10-22' } });
    fireEvent.change(timeInput(), { target: { value: '15:00' } });
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));

    // The submit says it is busy instead of turning disabled, so focus stays on it.
    const submit = screen.getByRole('button', { name: 'Adding…' });
    expect(submit).toHaveFocus();
    expect(submit).not.toBeDisabled();
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(titleBox()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    // A second click while it saves sends nothing more.
    await user.click(submit);
    expect(onCreate).toHaveBeenCalledTimes(1);

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

  it('keeps a past meeting’s editor or confirm in view: Past can’t fold it away', async () => {
    const user = userEvent.setup();
    renderManage({ meetings: [meeting(), past] });

    const toggle = screen.getByRole('button', { name: 'Past (1)' });
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Edit Kickoff' }));
    expect(toggle).toBeDisabled();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Edit meeting' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getByRole('button', { name: 'Delete Kickoff' }));
    expect(toggle).toBeDisabled();
    expect(screen.getByText(/Delete 'Kickoff'\?/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // With nothing open, Past folds as usual.
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Kickoff')).not.toBeInTheDocument();
  });

  it('shows an editor opened on a past meeting even with Past folded', () => {
    renderManage({ meetings: [meeting(), past], defaultEditingId: 'm-past' });
    expect(screen.getByRole('heading', { name: 'Edit meeting' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Past (1)' })).toBeDisabled();
  });

  it('keeps the form and its draft when the meeting being edited ends', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    const props = { meetings: [live, meeting()], onUpdate };
    const { rerender } = renderManage(props);

    await user.click(screen.getByRole('button', { name: 'Edit Standup' }));
    await user.clear(titleBox());
    await user.type(titleBox(), 'Standup, longer');
    // 4:05 PM PT: the 3:00 – 4:00 PM meeting ends while its editor is open.
    const later = new Date('2026-10-20T23:05:00Z');
    rerender(<TeamMeetingsList variant="manage" canManage now={later} zone={LA} schoolZone={LA} {...props} />);

    expect(screen.getByRole('heading', { name: 'Edit meeting' })).toBeInTheDocument();
    expect(titleBox()).toHaveValue('Standup, longer');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onUpdate).toHaveBeenCalledWith('m-live', expect.objectContaining({ title: 'Standup, longer' }));

    // Once the editor closes, the meeting goes where it now belongs.
    expect(await screen.findByRole('button', { name: 'Past (1)' })).toBeInTheDocument();
    expect(screen.queryByText('Standup')).not.toBeInTheDocument();
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

  it('keeps Delete focused and busy while it deletes', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onDelete = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderManage({ meetings: [meeting()], onDelete });

    await user.click(screen.getByRole('button', { name: 'Delete Sprint 3 planning' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const remove = screen.getByRole('button', { name: 'Deleting…' });
    expect(remove).toHaveFocus();
    expect(remove).toHaveAttribute('aria-disabled', 'true');
    expect(remove).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.click(remove);
    expect(onDelete).toHaveBeenCalledTimes(1);

    finish();
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

    expect(
      screen.getByText(/^One-off meetings for the whole team\. Everyone on the team sees them on the project page\./),
    ).toBeInTheDocument();
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

describe('TeamMeetingsList — focus when an editor or a delete confirm closes', () => {
  it('goes back to Add meeting when the new-meeting form is cancelled or escaped', async () => {
    const user = userEvent.setup();
    const { unmount } = renderManage({ meetings: [meeting()] });

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Add meeting' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Add meeting' })).toHaveFocus();
    unmount();

    // With no meetings, the form opened from the empty state, and its Add meeting comes back.
    renderManage();
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.keyboard('{Escape}');
    expect(screen.getByText('No team meetings yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add meeting' })).toHaveFocus();
  });

  it('goes back to the row’s Edit or Delete when its editor or delete confirm is cancelled or escaped', async () => {
    const user = userEvent.setup();
    renderManage({ meetings: [meeting(), meeting({ id: 'm2', title: 'Demo', startsAt: '2026-10-23T22:00:00Z' })] });
    const edit = () => screen.getByRole('button', { name: 'Edit Demo' });
    const remove = () => screen.getByRole('button', { name: 'Delete Demo' });

    await user.click(edit());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(edit()).toHaveFocus();
    await user.click(edit());
    await user.keyboard('{Escape}');
    expect(edit()).toHaveFocus();

    await user.click(remove());
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(remove()).toHaveFocus();
    await user.click(remove());
    await user.keyboard('{Escape}');
    expect(remove()).toHaveFocus();
  });

  it('lands on the row’s Edit once its edit is saved', async () => {
    const user = userEvent.setup();
    render(<StatefulList initial={[meeting(), meeting({ id: 'm2', title: 'Demo', startsAt: '2026-10-23T22:00:00Z' })]} />);

    await user.click(screen.getByRole('button', { name: 'Edit Demo' }));
    await user.type(titleBox(), ' day');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Demo day' })).toHaveFocus());
  });

  it('lands on the new row’s Edit after a create, or on Add meeting when the row is folded under Past', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<StatefulList initial={[meeting()]} />);

    await addMeeting(user, 'Retro');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Retro' })).toHaveFocus());
    unmount();

    // The meeting comes back as one that has already ended: it lands in Past, which stays folded.
    render(<StatefulList initial={[meeting()]} created={{ startsAt: '2026-10-13T18:00:00Z' }} />);
    await addMeeting(user, 'Retro');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add meeting' })).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Past (1)' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('after a delete, lands on the next row’s Edit, else the previous row’s, else Add meeting', async () => {
    const user = userEvent.setup();
    const at = (id: string, title: string, day: number) => meeting({ id, title, startsAt: `2026-10-${day}T18:00:00Z` });
    render(<StatefulList initial={[at('a', 'Alpha', 21), at('b', 'Bravo', 22), at('c', 'Charlie', 23)]} />);
    const remove = async (title: string) => {
      await user.click(screen.getByRole('button', { name: `Delete ${title}` }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
    };

    await remove('Bravo');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Charlie' })).toHaveFocus());
    await remove('Charlie');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit Alpha' })).toHaveFocus());
    await remove('Alpha');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add meeting' })).toHaveFocus());
    expect(screen.getByText('No team meetings yet')).toBeInTheDocument();
  });

  it('announces the same message again when it repeats', async () => {
    const user = userEvent.setup();
    render(<StatefulList />);
    const region = screen.getByRole('status');
    const heard: string[] = [];
    const observer = new MutationObserver(() => heard.push(region.textContent ?? ''));
    observer.observe(region, { childList: true, characterData: true, subtree: true });

    await addMeeting(user, 'Retro');
    await waitFor(() => expect(region).toHaveTextContent('Meeting added.'));
    await addMeeting(user, 'Demo', '11:00');

    // The region empties before the second "Meeting added.", so it is a change a screen reader reads.
    await waitFor(() => expect(heard.filter((text) => text === 'Meeting added.')).toHaveLength(2));
    observer.disconnect();
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
  const project = { id: 'p1', class_id: 'c1', name: 'Alpha', created_by: 'u-po', team_size: 4 } as ApiProject;

  beforeEach(() => {
    updateProject.mockReset();
  });

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

  it('keeps Save Changes on the Meetings tab while Details has unsaved edits, and saves them', async () => {
    const user = userEvent.setup();
    updateProject.mockResolvedValue({ message: 'Project updated', project: { ...project, name: 'Beta' } });
    const onProjectChange = vi.fn();
    const { onClose } = renderModal({ onProjectChange });

    const name = screen.getByRole('textbox', { name: 'Project name' });
    await user.clear(name);
    await user.type(name, 'Beta');
    await user.click(screen.getByRole('button', { name: 'Meetings' }));

    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(updateProject).toHaveBeenCalledWith('p1', expect.objectContaining({ name: 'Beta', team_size: 4 }));
    expect(onProjectChange).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps Save Changes on the Meetings tab while Team has an unsaved role change', async () => {
    const user = userEvent.setup();
    const members = [
      { user_id: 'u-po', email: 'ana@ucsc.edu', project_role: 'product owner', joined_at: '2026-10-01' },
      { user_id: 'u-ben', email: 'ben@ucsc.edu', project_role: 'member', joined_at: '2026-10-02' },
    ] as ApiProjectMember[];
    renderModal({ projectMembers: members });

    await user.click(screen.getByRole('button', { name: 'Team' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Select Scrum Master' }), 'u-ben');
    await user.click(screen.getByRole('button', { name: 'Meetings' }));

    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
  });

  it('drops staged edits on the Meetings tab’s Cancel, as the other tabs do', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();

    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' 2');
    await user.click(screen.getByRole('button', { name: 'Meetings' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it('shows Done again once the staged edit is undone', async () => {
    const user = userEvent.setup();
    renderModal();

    const name = screen.getByRole('textbox', { name: 'Project name' });
    await user.type(name, '!');
    await user.click(screen.getByRole('button', { name: 'Meetings' }));
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Details' }));
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), '{Backspace}');
    await user.click(screen.getByRole('button', { name: 'Meetings' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
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

  describe('with a meeting unsaved or saving', () => {
    const HINT = "Save or cancel the meeting you're editing first.";
    const done = () => screen.getByRole('button', { name: 'Done' });

    it('holds Done, with a hint, while a meeting form has unsaved input', async () => {
      const user = userEvent.setup();
      const { onClose } = renderModal();

      await user.click(screen.getByRole('button', { name: 'Meetings' }));
      await user.click(screen.getByRole('button', { name: 'Add meeting' }));
      await user.type(titleBox(), 'Retro');

      expect(done()).toBeDisabled();
      expect(screen.getByText(HINT)).toBeInTheDocument();
      expect(done()).toHaveAccessibleDescription(HINT);

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText(HINT)).not.toBeInTheDocument();
      await user.click(done());
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps a meeting draft through a trip to Details and back', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Meetings' }));
      await user.click(screen.getByRole('button', { name: 'Add meeting' }));
      await user.type(titleBox(), 'Retro');
      await user.click(screen.getByRole('button', { name: 'Details' }));

      expect(screen.getByRole('textbox', { name: 'Project name' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Team meetings', hidden: true })).not.toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Meetings' }));
      expect(screen.getByRole('heading', { name: 'New meeting' })).toBeVisible();
      expect(titleBox()).toHaveValue('Retro');
    });

    it('holds Done while a meeting is saving, and lets it go once the save settles', async () => {
      const user = userEvent.setup();
      let finish: () => void = () => {};
      const onUpdate = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
      renderModal({ meetingsList: { meetings: [meeting()], now: NOW, zone: LA, schoolZone: LA, onUpdate } });

      await user.click(screen.getByRole('button', { name: 'Meetings' }));
      await user.click(screen.getByRole('button', { name: 'Edit Sprint 3 planning' }));
      // Saved as it was: nothing is unsaved, only the request in flight holds Done, so no hint.
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-busy', 'true');
      expect(done()).toBeDisabled();
      expect(screen.queryByText(HINT)).not.toBeInTheDocument();

      finish();
      await waitFor(() => expect(done()).toBeEnabled());
    });

    it('holds Save Changes on Details while the Meetings tab has an unsaved meeting', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Meetings' }));
      await user.click(screen.getByRole('button', { name: 'Add meeting' }));
      await user.type(titleBox(), 'Retro');
      await user.click(screen.getByRole('button', { name: 'Details' }));

      const save = screen.getByRole('button', { name: 'Save Changes' });
      expect(save).toBeDisabled();
      expect(save).toHaveAccessibleDescription(HINT);
      // Cancel is still a way out, as the X, the backdrop and Escape are.
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
    });

    it('leaves Done alone while an open meeting form is untouched', async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole('button', { name: 'Meetings' }));
      await user.click(screen.getByRole('button', { name: 'Add meeting' }));
      expect(done()).toBeEnabled();
      expect(screen.queryByText(HINT)).not.toBeInTheDocument();

      // Typed and taken back out: the draft is what the form opened with again.
      await user.type(titleBox(), 'R');
      expect(done()).toBeDisabled();
      await user.type(titleBox(), '{Backspace}');
      expect(done()).toBeEnabled();

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      await user.click(screen.getByRole('button', { name: 'Edit Sprint 3 planning' }));
      expect(done()).toBeEnabled();
    });
  });
});

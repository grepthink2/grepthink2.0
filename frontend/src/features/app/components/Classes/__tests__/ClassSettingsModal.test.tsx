import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Class } from '@/lib/classContext';
import { cssRules } from '@/test/cssRules';

const ctx = vi.hoisted(() => ({
  getClassStatus: vi.fn(() => 'active' as const),
  setClassLifecycleStatus: vi.fn(),
  hideClassFromUI: vi.fn(),
  setClassExternalTasksUrl: vi.fn(),
  setClassEndDate: vi.fn(),
  setClassSprints: vi.fn(),
}));
// The day the mocked picker picks when clicked.
const picks = vi.hoisted(() => ({ day: '' }));
type PickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  disabledBefore?: Date;
};
// The props each mocked picker last rendered with, by label.
const pickers = vi.hoisted(() => ({}) as Record<string, PickerProps>);
vi.mock('@/lib/classContext', () => ({ useClass: () => ctx }));
vi.mock('@/lib/api', () => ({ api: { getClassRoster: vi.fn() } }));
// The real picker is a calendar popover; a button that shows its day and picks another is enough here.
vi.mock('@/components/DatePickerField/DatePickerField', () => ({
  DatePickerField: (props: PickerProps) => {
    pickers[props.label] = props;
    return (
      <button type="button" disabled={props.disabled} onClick={() => props.onChange(picks.day)}>
        {props.label}: {props.value || 'not set'}
      </button>
    );
  },
}));

import ClassSettingsModal from '../ClassSettingsModal';

const JOB_BOARD = 'https://job191.yeterly.ai/';

function cls(id: string, external_tasks_url: string | null, end_date: string | null = null): Class {
  return {
    id,
    name: id.toUpperCase(),
    created_by: 'me',
    created_at: '2026-09-27',
    my_role: 'instructor',
    institution: null,
    external_tasks_url,
    end_date,
  };
}

const job = cls('job-191', JOB_BOARD, '2026-12-18');

function renderSettings(classItem: Class) {
  return render(<ClassSettingsModal isOpen onClose={() => {}} classItem={classItem} />);
}

const linkBox = () => screen.getByLabelText(/Tasks - External link/i);
const saveButton = () => screen.getByRole('button', { name: 'Save link' });
// Each setting has its own status line, so look in the section of the control being tested.
const sectionOf = (control: HTMLElement) => within(control.closest('section') as HTMLElement);
const linkSection = () => sectionOf(linkBox());

beforeEach(() => {
  vi.clearAllMocks();
  ctx.setClassExternalTasksUrl.mockResolvedValue(undefined);
  ctx.setClassEndDate.mockResolvedValue(undefined);
  // What a schedule change wrote, as the class context answers it.
  ctx.setClassSprints.mockResolvedValue({ teams: 2, created: 8, updated: 0, deleted: 0 });
  picks.day = '2026-12-04';
});

describe('ClassSettingsModal — date labels', () => {
  it('gives the last day\'s label the look of the section labels beside it', () => {
    const [label] = cssRules('.class-settings-modal .gt-field__label');
    expect(label.getPropertyValue('font-size')).toBe('0.875rem');
    expect(label.getPropertyValue('font-weight')).toBe('600');
    expect(label.getPropertyValue('color')).toBe('rgb(48, 48, 48)');
  });
});

describe('ClassSettingsModal — Tasks - External link', () => {
  it("shows the class's current link, with an empty status line ready to announce a save", () => {
    renderSettings(job);
    expect(linkBox()).toHaveValue(JOB_BOARD);
    // A live region already on the page is announced when its text changes; one inserted along
    // with its text often is not.
    expect(linkSection().getByRole('status')).toBeEmptyDOMElement();
  });

  it('offers Save only once the link changes', async () => {
    const user = userEvent.setup();
    renderSettings(job);
    expect(saveButton()).toBeDisabled();
    await user.type(linkBox(), 'board');
    expect(saveButton()).toBeEnabled();
  });

  it('saves a changed link, less surrounding spaces, and says so', async () => {
    const user = userEvent.setup();
    renderSettings(job);
    await user.clear(linkBox());
    await user.type(linkBox(), '  https://tasks.grepthink2.com/cse115a ');
    await user.click(saveButton());
    expect(ctx.setClassExternalTasksUrl).toHaveBeenCalledWith('job-191', 'https://tasks.grepthink2.com/cse115a');
    expect(await linkSection().findByRole('status')).toHaveTextContent(/saved/i);
  });

  it('removes the link', async () => {
    const user = userEvent.setup();
    renderSettings(job);
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(ctx.setClassExternalTasksUrl).toHaveBeenCalledWith('job-191', null);
    expect(await linkSection().findByRole('status')).toHaveTextContent(/removed/i);
  });

  it('saves an emptied box as no link', async () => {
    const user = userEvent.setup();
    renderSettings(job);
    await user.clear(linkBox());
    await user.click(saveButton());
    expect(ctx.setClassExternalTasksUrl).toHaveBeenCalledWith('job-191', null);
  });

  it('keeps keyboard focus in the link box when the button pressed goes away', async () => {
    // Remove disappears and Save turns disabled once the link is saved; focus must not fall to the page.
    const user = userEvent.setup();
    renderSettings(job);
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    await linkSection().findByRole('status');
    expect(linkBox()).toHaveFocus();

    await user.type(linkBox(), JOB_BOARD);
    await user.click(saveButton());
    expect(await linkSection().findByRole('status')).toHaveTextContent(/saved/i);
    expect(linkBox()).toHaveFocus();
  });

  it('offers Remove only when the class has a link', () => {
    renderSettings(cls('cse-115a', null));
    expect(linkBox()).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Remove link' })).not.toBeInTheDocument();
  });

  it('refuses a link that is not a full web address, says why at the box, and saves nothing', async () => {
    const user = userEvent.setup();
    renderSettings(cls('cse-115a', null));
    await user.type(linkBox(), 'ftp://example.org/tasks');
    await user.click(saveButton());
    expect(ctx.setClassExternalTasksUrl).not.toHaveBeenCalled();
    expect(linkBox()).toHaveAttribute('aria-invalid', 'true');
    expect(linkBox()).toHaveAccessibleDescription(/https:\/\//);
    expect(linkBox()).toHaveFocus(); // so a screen reader reads the reason
  });

  it('keeps what you typed and says why when the save fails', async () => {
    const user = userEvent.setup();
    ctx.setClassExternalTasksUrl.mockRejectedValue(new Error('Failed to update the tasks link'));
    renderSettings(cls('cse-115a', null));
    await user.type(linkBox(), JOB_BOARD);
    await user.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update the tasks link');
    expect(linkBox()).toHaveValue(JOB_BOARD);
    expect(linkSection().getByRole('status')).toBeEmptyDOMElement();
  });

  it('says what to do when the API refuses the link, not a bare status code', async () => {
    const user = userEvent.setup();
    ctx.setClassExternalTasksUrl.mockRejectedValue(
      Object.assign(new Error('Request failed with status 422'), {
        status: 422,
        detail: [{ type: 'value_error', loc: ['body', 'external_tasks_url'], msg: 'Value error, refused' }],
      }),
    );
    renderSettings(cls('cse-115a', null));
    await user.type(linkBox(), JOB_BOARD);
    await user.click(saveButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/can't be used/);
    expect(alert).not.toHaveTextContent('422');
  });

  it("keeps a save that lands late out of the next class's dialog", async () => {
    // Save on one class, close, open another before the save answers.
    const user = userEvent.setup();
    let finish: () => void = () => {};
    ctx.setClassExternalTasksUrl.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const { rerender } = renderSettings(cls('cse-115a', null));
    await user.type(linkBox(), 'https://tasks.grepthink2.com/cse115a');
    await user.click(screen.getByRole('button', { name: 'Save link' }));
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={job} />);
    await act(async () => finish());

    expect(linkBox()).toHaveValue(JOB_BOARD); // the open class's own link, not the other's
    expect(linkSection().getByRole('status')).toBeEmptyDOMElement();
    expect(saveButton()).toBeDisabled(); // "Save link", not stuck on "Saving…"
    expect(screen.getByRole('button', { name: 'Remove link' })).toBeEnabled();
  });

  it("starts from the next class's link when another class is opened", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSettings(job);
    await user.type(linkBox(), 'unsaved');
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={cls('cse-115a', null)} />);
    expect(linkBox()).toHaveValue('');
    expect(saveButton()).toBeDisabled();
  });
});

describe('ClassSettingsModal — last day of classes', () => {
  const endDateField = () => screen.getByRole('button', { name: /^Last Day of Classes/ });
  const endDateSave = () => screen.getByRole('button', { name: 'Save last day' });
  const endDateSection = () => sectionOf(endDateField());

  it("shows the class's last day and a hint, with an empty status line ready to announce a save", () => {
    renderSettings(job);
    expect(endDateField()).toHaveTextContent('Last Day of Classes: 2026-12-18');
    expect(screen.getByText('Before finals week')).toBeInTheDocument();
    expect(endDateSection().getByRole('status')).toBeEmptyDOMElement();
  });

  it('offers Save only once the day changes', async () => {
    const user = userEvent.setup();
    renderSettings(job);
    expect(endDateSave()).toBeDisabled();
    await user.click(endDateField()); // picks 2026-12-04 over 2026-12-18
    expect(endDateSave()).toBeEnabled();

    picks.day = '2026-12-18';
    await user.click(endDateField()); // back to the day the class has
    expect(endDateSave()).toBeDisabled();
  });

  it('shows no day for a class that has none, and Save waits until one is picked', async () => {
    const user = userEvent.setup();
    renderSettings(cls('cse-115a', null));
    expect(endDateField()).toHaveTextContent('Last Day of Classes: not set');
    expect(endDateSave()).toBeDisabled();
    await user.click(endDateField());
    expect(endDateSave()).toBeEnabled();
  });

  it('saves the day picked, shows it, and says so', async () => {
    const user = userEvent.setup();
    renderSettings(job);
    await user.click(endDateField());
    await user.click(endDateSave());
    expect(ctx.setClassEndDate).toHaveBeenCalledWith('job-191', '2026-12-04');
    expect(await endDateSection().findByRole('status')).toHaveTextContent(/saved/i);
    expect(endDateField()).toHaveTextContent('Last Day of Classes: 2026-12-04');
    expect(endDateSave()).toBeDisabled(); // the saved day is the day shown
    expect(ctx.setClassExternalTasksUrl).not.toHaveBeenCalled();
  });

  it('shows Saving…, and neither the button nor the day can be changed while the save is in flight', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    ctx.setClassEndDate.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    renderSettings(job);
    await user.click(endDateField());
    await user.click(endDateSave());
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    // A day picked now would be written over by the day being saved when its answer lands.
    expect(endDateField()).toBeDisabled();

    await act(async () => finish());
    expect(await endDateSection().findByRole('status')).toHaveTextContent(/saved/i);
    expect(endDateField()).toBeEnabled();
    expect(ctx.setClassEndDate).toHaveBeenCalledTimes(1);
  });

  it('keeps the day picked and says why when the save fails', async () => {
    const user = userEvent.setup();
    picks.day = '2026-09-01';
    ctx.setClassEndDate.mockRejectedValue(new Error("The last day of classes can't be before the first week of term."));
    renderSettings(job);
    await user.click(endDateField());
    await user.click(endDateSave());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The last day of classes can't be before the first week of term.",
    );
    expect(endDateField()).toHaveTextContent('Last Day of Classes: 2026-09-01');
    expect(endDateSection().getByRole('status')).toBeEmptyDOMElement();
    expect(endDateSave()).toBeEnabled(); // pick another day, or try again
  });

  it('forgets an earlier failure or notice once another day is picked', async () => {
    const user = userEvent.setup();
    ctx.setClassEndDate.mockRejectedValueOnce(new Error('Failed to update the last day of classes'));
    renderSettings(job);
    await user.click(endDateField());
    await user.click(endDateSave());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    picks.day = '2026-12-10';
    await user.click(endDateField());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(endDateSave());
    expect(await endDateSection().findByRole('status')).toHaveTextContent(/saved/i);

    picks.day = '2026-12-11';
    await user.click(endDateField());
    expect(endDateSection().getByRole('status')).toBeEmptyDOMElement();
  });

  it("keeps a save that lands late out of the next class's dialog", async () => {
    // Save on one class, close, open another before the save answers.
    const user = userEvent.setup();
    let finish: () => void = () => {};
    ctx.setClassEndDate.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const { rerender } = renderSettings(cls('cse-115a', null));
    await user.click(endDateField());
    await user.click(endDateSave());
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={job} />);
    await act(async () => finish());

    expect(endDateField()).toHaveTextContent('Last Day of Classes: 2026-12-18'); // the open class's own day
    expect(endDateSection().getByRole('status')).toBeEmptyDOMElement();
    expect(endDateSave()).toBeDisabled(); // "Save last day", not stuck on "Saving…"
  });

  it("keeps a failure that lands late out of the next class's dialog", async () => {
    const user = userEvent.setup();
    let fail: (reason: Error) => void = () => {};
    ctx.setClassEndDate.mockReturnValueOnce(new Promise<void>((_, reject) => (fail = reject)));
    const { rerender } = renderSettings(cls('cse-115a', null));
    await user.click(endDateField());
    await user.click(endDateSave());
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={job} />);
    await act(async () => fail(new Error('Failed to update the last day of classes')));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(endDateField()).toHaveTextContent('Last Day of Classes: 2026-12-18');
    expect(endDateSave()).toBeDisabled();
  });

  it('shows the saved day when the dialog is closed and opened again before the save answers', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    ctx.setClassEndDate.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    const { rerender } = renderSettings(job);
    await user.click(endDateField()); // picks 2026-12-04 over 2026-12-18
    await user.click(endDateSave());
    rerender(<ClassSettingsModal isOpen={false} onClose={() => {}} classItem={job} />);
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={job} />); // the row has not caught up yet
    expect(endDateField()).toHaveTextContent('Last Day of Classes: 2026-12-18');
    await act(async () => finish());

    expect(endDateField()).toHaveTextContent('Last Day of Classes: 2026-12-04');
    expect(endDateSave()).toBeDisabled();
    expect(await endDateSection().findByRole('status')).toHaveTextContent(/saved/i);
  });

  it("starts from the next class's day when another class is opened", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSettings(job);
    await user.click(endDateField()); // an unsaved pick
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={cls('cse-115a', null)} />);
    expect(endDateField()).toHaveTextContent('Last Day of Classes: not set');
    expect(endDateSave()).toBeDisabled();
  });
});

describe('ClassSettingsModal — sprints', () => {
  type User = ReturnType<typeof userEvent.setup>;
  /** What a schedule change wrote, as the class context answers it. */
  type Written = { teams: number; created: number; updated: number; deleted: number };

  const NO_SPRINTS = { sprint_count: null, sprint_frequency: null, sprints_start_on: null };
  // Five two-week sprints from Sep 21: the last runs from Nov 16 to Nov 29.
  const FIVE_BIWEEKLY = { sprint_count: 5, sprint_frequency: 'biweekly', sprints_start_on: '2026-09-21' } as const;

  /** CSE 115A, from its first week of term on Sep 21 to its last day of classes on Dec 11. */
  function course(schedule: Pick<Class, 'sprint_count' | 'sprint_frequency' | 'sprints_start_on'> = NO_SPRINTS): Class {
    return { ...cls('c1', null, '2026-12-11'), start_date: '2026-09-21', ...schedule };
  }

  const sprintsSection = () => within(screen.getByRole('heading', { name: 'Sprints' }).closest('section') as HTMLElement);
  const setUp = () => screen.getByRole('button', { name: 'Set up sprints' });
  const howMany = () => screen.getByRole('spinbutton', { name: 'How many' });
  const every = () => screen.getByRole('combobox', { name: 'Every' });
  const firstSprint = () => screen.getByRole('button', { name: /^First sprint starts/ });
  const save = () => screen.getByRole('button', { name: "Save and update every team's sprints" });
  // The section's two status lines: when the last sprint ends, then what the save did.
  const preview = () => sprintsSection().getAllByRole('status')[0];
  const notice = () => sprintsSection().getAllByRole('status')[1];
  const lastDayField = () => screen.getByRole('button', { name: /^Last Day of Classes/ });
  const lastDaySection = () => sectionOf(lastDayField());

  async function setCount(user: User, count: string) {
    await user.clear(howMany());
    await user.type(howMany(), count);
  }

  it('offers to set up sprints for a class that has none, and shows no last sprint beside the last day', () => {
    renderSettings(course());
    expect(sprintsSection().getByRole('button', { name: 'Set up sprints' })).toBeEnabled();
    expect(screen.queryByRole('spinbutton', { name: 'How many' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Save and update every team's sprints" })).not.toBeInTheDocument();
    expect(lastDaySection().queryByText(/^Sprint \d+ ends/)).not.toBeInTheDocument();
  });

  it('sets up five sprints every two weeks from the first week of term, ready to save', async () => {
    const user = userEvent.setup();
    renderSettings(course());
    await user.click(setUp());
    expect(screen.queryByRole('button', { name: 'Set up sprints' })).not.toBeInTheDocument();
    // The button pressed went away: the keyboard goes on to the first field, not to the page.
    expect(howMany()).toHaveFocus();
    const group = screen.getByRole('group', { name: 'Sprints' });
    expect(within(group).getByRole('spinbutton', { name: 'How many' })).toHaveValue(5);
    expect(howMany()).toHaveAccessibleDescription('1–20');
    expect(within(group).getByRole('combobox', { name: 'Every' })).toHaveDisplayValue('two weeks');
    expect(within(every()).getAllByRole('option').map((o) => o.textContent)).toEqual(['week', 'two weeks', 'month']);
    expect(within(group).getByRole('button', { name: /^First sprint starts/ })).toHaveTextContent(
      'First sprint starts: 2026-09-21',
    );
    expect(preview()).toHaveTextContent(/^Sprint 5 ends Nov 29$/);
    expect(save()).toBeEnabled();
    expect(notice()).toBeEmptyDOMElement();
  });

  it("saves the schedule, says how many teams' sprints follow it, and shows its last sprint beside the last day", async () => {
    const user = userEvent.setup();
    renderSettings(course());
    await user.click(setUp());
    await setCount(user, '4');
    await user.selectOptions(every(), 'week');
    picks.day = '2026-09-28';
    await user.click(firstSprint());
    expect(preview()).toHaveTextContent(/^Sprint 4 ends Oct 25$/);
    await user.click(save());
    expect(ctx.setClassSprints).toHaveBeenCalledWith('c1', {
      sprint_count: 4,
      sprint_frequency: 'weekly',
      sprints_start_on: '2026-09-28',
    });
    await waitFor(() => expect(notice()).toHaveTextContent(/^Sprints updated for 2 teams$/));
    expect(howMany()).toHaveValue(4); // the saved schedule is the one shown
    expect(lastDaySection().getByText('Sprint 4 ends Oct 25')).toBeInTheDocument();
  });

  it('shows the saved schedule, and its last sprint beside the last day until a change is saved', async () => {
    const user = userEvent.setup();
    renderSettings(course(FIVE_BIWEEKLY));
    expect(screen.queryByRole('button', { name: 'Set up sprints' })).not.toBeInTheDocument();
    expect(howMany()).toHaveValue(5);
    expect(howMany()).not.toHaveFocus(); // nothing was pressed
    expect(every()).toHaveDisplayValue('two weeks');
    expect(firstSprint()).toHaveTextContent('First sprint starts: 2026-09-21');
    expect(preview()).toHaveTextContent(/^Sprint 5 ends Nov 29$/);
    expect(lastDaySection().getByText('Sprint 5 ends Nov 29')).toBeInTheDocument();

    await user.selectOptions(every(), 'week');
    expect(preview()).toHaveTextContent(/^Sprint 5 ends Oct 25$/);
    // Beside the last day: the schedule saved, which the API checks a new last day against.
    expect(lastDaySection().getByText('Sprint 5 ends Nov 29')).toBeInTheDocument();
  });

  it('sends a saved schedule again without a change, which brings any team whose sprints lag back in line', async () => {
    const user = userEvent.setup();
    renderSettings(course(FIVE_BIWEEKLY));
    expect(save()).toBeEnabled();
    await user.click(save());
    expect(ctx.setClassSprints).toHaveBeenCalledWith('c1', {
      sprint_count: 5,
      sprint_frequency: 'biweekly',
      sprints_start_on: '2026-09-21',
    });
    await waitFor(() => expect(notice()).toHaveTextContent(/^Sprints updated for 2 teams$/));
    expect(save()).toBeEnabled(); // and again, should a team still lag
    expect(ctx.setClassSprints).toHaveBeenCalledTimes(1);
  });

  it.each([
    [1, 'Sprints updated for 1 team'],
    [0, 'Sprints saved. New teams get them.'],
  ])('says what a save did for a class with %i teams', async (teams, said) => {
    const user = userEvent.setup();
    ctx.setClassSprints.mockResolvedValue({ teams, created: 0, updated: 0, deleted: 0 });
    renderSettings(course());
    await user.click(setUp());
    await user.click(save());
    await waitFor(() => expect(notice().textContent).toBe(said));
  });

  it.each([
    [409, 'Team Rocket already uses Sprint 5; lower the count after they move their stories or delete that plan'],
    [422, 'The sprints run past the last day of classes (Dec 11, 2026)'],
  ])('shows the API refusing the schedule (%i) in its own words, and keeps what was chosen', async (status, detail) => {
    const user = userEvent.setup();
    ctx.setClassSprints.mockRejectedValue(Object.assign(new Error(detail), { status, detail }));
    renderSettings(course(FIVE_BIWEEKLY));
    await setCount(user, '4');
    await user.click(save());
    expect((await screen.findByRole('alert')).textContent).toBe(detail);
    expect(howMany()).toHaveValue(4);
    expect(notice()).toBeEmptyDOMElement();
    expect(save()).toBeEnabled(); // change the schedule, or try again
    expect(lastDaySection().getByText('Sprint 5 ends Nov 29')).toBeInTheDocument(); // nothing was saved
  });

  it('holds Save while the last sprint would end after the last day of classes, not when it ends on it', async () => {
    const user = userEvent.setup();
    renderSettings({ ...course(), end_date: '2026-11-29' });
    await user.click(setUp()); // five two-week sprints from Sep 21 end on Nov 29, the last day itself
    expect(preview()).toHaveTextContent(/^Sprint 5 ends Nov 29$/);
    expect(save()).toBeEnabled();
    await setCount(user, '6'); // the sixth would end on Dec 13
    expect(preview()).toHaveTextContent(/^Sprint 6 would end after the last day of classes$/);
    expect(save()).toBeDisabled();
    await setCount(user, '4');
    expect(preview()).toHaveTextContent(/^Sprint 4 ends Nov 15$/);
    expect(save()).toBeEnabled();
  });

  it.each([
    ['Friday', '2026-12-11'],
    ['Sunday', '2026-12-13'],
  ])(
    'lets the last sprint end on the Sunday of the week that holds the last day of classes (a %s), and no later',
    async (_weekday, lastDay) => {
      const user = userEvent.setup();
      renderSettings({ ...course(FIVE_BIWEEKLY), end_date: lastDay });
      await setCount(user, '6'); // the sixth runs from Mon Nov 30 to Sun Dec 13
      expect(preview()).toHaveTextContent(/^Sprint 6 ends Dec 13$/);
      expect(preview()).not.toHaveClass('class-settings-modal__sprint-preview--past-end');
      expect(save()).toBeEnabled();
      picks.day = '2026-09-22'; // from Tue Sep 22, the sixth would end on Mon Dec 14
      await user.click(firstSprint());
      expect(preview()).toHaveTextContent(/^Sprint 6 would end after the last day of classes$/);
      expect(save()).toBeDisabled();
    },
  );

  it('writes the line about the last sprint as a hint, in the error colour while it would end too late', async () => {
    const user = userEvent.setup();
    renderSettings(course(FIVE_BIWEEKLY));
    expect(preview()).toHaveClass('class-settings-modal__hint');
    expect(preview()).not.toHaveClass('class-settings-modal__sprint-preview--past-end');
    await setCount(user, '7'); // the seventh would end on Sun Dec 27, after the week of Fri Dec 11
    expect(preview()).toHaveClass('class-settings-modal__hint', 'class-settings-modal__sprint-preview--past-end');
    // The hint's look, so the two can't drift apart: the modifier changes the colour and nothing else.
    expect(cssRules('.class-settings-modal__sprint-preview')).toEqual([]);
    const [pastEnd] = cssRules('.class-settings-modal__sprint-preview--past-end');
    expect(Array.from(pastEnd)).toEqual(['color']);
    expect(getComputedStyle(preview()).color).toBe('var(--gt-error-text)'); // over the hint's colour
  });

  it('counts from the last day of classes saved, as the API does, not from one picked and not saved yet', async () => {
    const user = userEvent.setup();
    renderSettings(course(FIVE_BIWEEKLY));
    await setCount(user, '7'); // the seventh ends on Sun Dec 27
    picks.day = '2026-12-25'; // the Friday of that week
    await user.click(lastDayField());
    expect(preview()).toHaveTextContent(/^Sprint 7 would end after the last day of classes$/);
    await user.click(screen.getByRole('button', { name: 'Save last day' }));
    await waitFor(() => expect(preview()).toHaveTextContent(/^Sprint 7 ends Dec 27$/));
    expect(save()).toBeEnabled();
  });

  it('takes a whole number of sprints from 1 to 20, and holds Save until it has one', async () => {
    const user = userEvent.setup();
    renderSettings(course(FIVE_BIWEEKLY));
    await user.clear(howMany());
    expect(howMany()).not.toHaveAttribute('aria-invalid'); // an empty box is not an error yet
    expect(preview()).toBeEmptyDOMElement();
    expect(save()).toBeDisabled();
    await user.type(howMany(), '21');
    expect(howMany()).toHaveAttribute('aria-invalid', 'true');
    expect(howMany()).toHaveAccessibleDescription('Enter a whole number from 1 to 20');
    expect(preview()).toBeEmptyDOMElement();
    expect(save()).toBeDisabled();
  });

  it('offers no day before the first week of term for the first sprint', () => {
    renderSettings(course(FIVE_BIWEEKLY));
    expect(pickers['First sprint starts'].disabledBefore).toEqual(new Date(2026, 8, 21)); // Sep 21, local midnight
  });

  it('waits for a first day when the class has no first week of term to start from', async () => {
    const user = userEvent.setup();
    renderSettings({ ...course(), start_date: undefined });
    await user.click(setUp());
    expect(firstSprint()).toHaveTextContent('First sprint starts: not set');
    expect(pickers['First sprint starts'].disabledBefore).toBeUndefined();
    expect(preview()).toBeEmptyDOMElement();
    expect(save()).toBeDisabled();
    picks.day = '2026-09-28';
    await user.click(firstSprint());
    expect(preview()).toHaveTextContent(/^Sprint 5 ends Dec 6$/);
    expect(save()).toBeEnabled();
  });

  it('shows Saving…, and the schedule cannot be changed while the save is in flight', async () => {
    const user = userEvent.setup();
    let finish: (written: Written) => void = () => {};
    ctx.setClassSprints.mockReturnValueOnce(new Promise<Written>((resolve) => (finish = resolve)));
    renderSettings(course(FIVE_BIWEEKLY));
    await setCount(user, '4');
    await user.click(save());
    const saving = screen.getByRole('button', { name: 'Saving…' });
    expect(saving).toBeDisabled();
    // A change made now would be written over by the schedule being saved when its answer lands.
    expect(howMany()).toBeDisabled();
    expect(every()).toBeDisabled();
    expect(firstSprint()).toBeDisabled();
    // A browser moves focus off a button that turns disabled, to the page. jsdom keeps it on the
    // button (and won't blur a disabled one), so the test puts it on the page.
    act(() => {
      document.body.tabIndex = -1;
      document.body.focus();
      document.body.removeAttribute('tabindex');
    });
    expect(document.body).toHaveFocus();

    await act(async () => finish({ teams: 3, created: 0, updated: 0, deleted: 3 }));
    expect(notice()).toHaveTextContent(/^Sprints updated for 3 teams$/);
    expect(howMany()).toBeEnabled();
    expect(save()).toHaveFocus(); // the keyboard is back on Save
    expect(ctx.setClassSprints).toHaveBeenCalledTimes(1);
  });

  it('forgets an earlier failure or notice once the schedule changes', async () => {
    const user = userEvent.setup();
    ctx.setClassSprints.mockRejectedValueOnce(new Error('Failed to update the sprint schedule'));
    renderSettings(course(FIVE_BIWEEKLY));
    await setCount(user, '4');
    await user.click(save());
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await setCount(user, '3');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(save());
    await waitFor(() => expect(notice()).toHaveTextContent(/^Sprints updated for 2 teams$/));
    await user.selectOptions(every(), 'week');
    expect(notice()).toBeEmptyDOMElement();

    await user.click(save());
    await waitFor(() => expect(notice()).toHaveTextContent(/^Sprints updated for 2 teams$/));
    picks.day = '2026-09-28';
    await user.click(firstSprint());
    expect(notice()).toBeEmptyDOMElement();
  });

  it("keeps a save that lands late out of the next class's dialog", async () => {
    // Save on one class, close, open another before the save answers.
    const user = userEvent.setup();
    let finish: (written: Written) => void = () => {};
    ctx.setClassSprints.mockReturnValueOnce(new Promise<Written>((resolve) => (finish = resolve)));
    const { rerender } = renderSettings(course());
    await user.click(setUp());
    await user.click(save());
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={{ ...job, start_date: '2026-09-21' }} />);
    await act(async () => finish({ teams: 2, created: 10, updated: 0, deleted: 0 }));

    expect(setUp()).toBeInTheDocument(); // the open class has no schedule: its own section, not the other's
    expect(screen.queryByText(/^Sprints updated/)).not.toBeInTheDocument();
    expect(lastDaySection().queryByText(/^Sprint \d+ ends/)).not.toBeInTheDocument();
    await user.click(setUp());
    expect(save()).toBeEnabled(); // "Save and update every team's sprints", not stuck on "Saving…"
  });

  it('shows the saved schedule when the dialog is closed and opened again before the save answers', async () => {
    const user = userEvent.setup();
    let finish: (written: Written) => void = () => {};
    ctx.setClassSprints.mockReturnValueOnce(new Promise<Written>((resolve) => (finish = resolve)));
    const c1 = course(FIVE_BIWEEKLY);
    const { rerender } = renderSettings(c1);
    await setCount(user, '4');
    await user.click(save());
    rerender(<ClassSettingsModal isOpen={false} onClose={() => {}} classItem={c1} />);
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={c1} />); // the row has not caught up yet
    expect(howMany()).toHaveValue(5);
    await act(async () => finish({ teams: 2, created: 0, updated: 0, deleted: 2 }));

    expect(howMany()).toHaveValue(4);
    expect(save()).toBeEnabled(); // "Save and update every team's sprints", not stuck on "Saving…"
    expect(notice()).toHaveTextContent(/^Sprints updated for 2 teams$/);
    expect(lastDaySection().getByText('Sprint 4 ends Nov 15')).toBeInTheDocument();
  });

  it("starts from the next class's schedule when another class is opened", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSettings(course());
    await user.click(setUp());
    await setCount(user, '4'); // not saved
    await user.selectOptions(every(), 'week');
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={job} />);
    expect(setUp()).toBeInTheDocument(); // a class with no schedule offers to set one up again
    rerender(<ClassSettingsModal isOpen onClose={() => {}} classItem={course(FIVE_BIWEEKLY)} />);
    expect(howMany()).toHaveValue(5);
    expect(every()).toHaveDisplayValue('two weeks');
  });
});

describe('ClassSettingsModal — Delete class', () => {
  it('asks first: Esc closes only the question, and Remove from my view hides the class', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ClassSettingsModal isOpen onClose={onClose} classItem={job} />);
    const del = screen.getByRole('button', { name: 'Delete class' });
    await user.click(del);
    const question = screen.getByRole('alertdialog', { name: 'Delete class?' });
    expect(question).toHaveAccessibleDescription(/only hides it for you/);
    expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(within(question).getByRole('button', { name: 'Remove from my view' })).toHaveClass('gt-button--danger');

    await user.keyboard('{Escape}');
    expect(del).toHaveFocus();
    // The settings dialog closes 200ms after its own Esc; this one was the question's alone.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(onClose).not.toHaveBeenCalled();
    expect(ctx.hideClassFromUI).not.toHaveBeenCalled();

    await user.click(del);
    await user.click(screen.getByRole('button', { name: 'Remove from my view' }));
    expect(ctx.hideClassFromUI).toHaveBeenCalledWith('job-191');
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

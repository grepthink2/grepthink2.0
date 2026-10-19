import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Class } from '@/lib/classContext';

const ctx = vi.hoisted(() => ({
  getClassStatus: vi.fn(() => 'active' as const),
  setClassLifecycleStatus: vi.fn(),
  hideClassFromUI: vi.fn(),
  setClassExternalTasksUrl: vi.fn(),
  setClassEndDate: vi.fn(),
}));
// The day the mocked picker picks when clicked.
const picks = vi.hoisted(() => ({ day: '' }));
vi.mock('@/lib/classContext', () => ({ useClass: () => ctx }));
vi.mock('@/lib/api', () => ({ api: { getClassRoster: vi.fn() } }));
// The real picker is a calendar popover; a button that shows its day and picks another is enough here.
vi.mock('@features/app/components/Fields/DatePickerField', () => ({
  default: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange(picks.day)}>
      {label}: {value || 'not set'}
    </button>
  ),
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
  picks.day = '2026-12-04';
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
  const endDateSave = () => screen.getByRole('button', { name: 'Save' });
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

  it('shows Saving… and cannot be pressed again while the save is in flight', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    ctx.setClassEndDate.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    renderSettings(job);
    await user.click(endDateField());
    await user.click(endDateSave());
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();

    await act(async () => finish());
    expect(await endDateSection().findByRole('status')).toHaveTextContent(/saved/i);
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
    expect(endDateSave()).toBeDisabled(); // "Save", not stuck on "Saving…"
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

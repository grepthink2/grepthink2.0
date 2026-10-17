import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Class } from '@/lib/classContext';

const ctx = vi.hoisted(() => ({
  getClassStatus: vi.fn(() => 'active' as const),
  setClassLifecycleStatus: vi.fn(),
  hideClassFromUI: vi.fn(),
  setClassExternalTasksUrl: vi.fn(),
}));
vi.mock('@/lib/classContext', () => ({ useClass: () => ctx }));
vi.mock('@/lib/api', () => ({ api: { getClassRoster: vi.fn() } }));

import ClassSettingsModal from '../ClassSettingsModal';

const JOB_BOARD = 'https://job191.yeterly.ai/';

function cls(id: string, external_tasks_url: string | null): Class {
  return {
    id,
    name: id.toUpperCase(),
    created_by: 'me',
    created_at: '2026-09-27',
    my_role: 'instructor',
    institution: null,
    external_tasks_url,
  };
}

const job = cls('job-191', JOB_BOARD);

function renderSettings(classItem: Class) {
  return render(<ClassSettingsModal isOpen onClose={() => {}} classItem={classItem} />);
}

const linkBox = () => screen.getByLabelText(/Tasks - External link/i);
const saveButton = () => screen.getByRole('button', { name: 'Save link' });

beforeEach(() => {
  vi.clearAllMocks();
  ctx.setClassExternalTasksUrl.mockResolvedValue(undefined);
});

describe('ClassSettingsModal — Tasks - External link', () => {
  it("shows the class's current link", () => {
    renderSettings(job);
    expect(linkBox()).toHaveValue(JOB_BOARD);
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
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
  });

  it('removes the link', async () => {
    const user = userEvent.setup();
    renderSettings(job);
    await user.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(ctx.setClassExternalTasksUrl).toHaveBeenCalledWith('job-191', null);
    expect(await screen.findByRole('status')).toHaveTextContent(/removed/i);
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
    await screen.findByRole('status');
    expect(linkBox()).toHaveFocus();

    await user.type(linkBox(), JOB_BOARD);
    await user.click(saveButton());
    expect(await screen.findByRole('status')).toHaveTextContent(/saved/i);
    expect(linkBox()).toHaveFocus();
  });

  it('offers Remove only when the class has a link', () => {
    renderSettings(cls('cse-115a', null));
    expect(linkBox()).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Remove link' })).not.toBeInTheDocument();
  });

  it('refuses a link that is not a full web address, says why, and saves nothing', async () => {
    const user = userEvent.setup();
    renderSettings(cls('cse-115a', null));
    await user.type(linkBox(), 'ftp://example.org/tasks');
    await user.click(saveButton());
    expect(ctx.setClassExternalTasksUrl).not.toHaveBeenCalled();
    expect(linkBox()).toHaveAttribute('aria-invalid', 'true');
    expect(linkBox()).toHaveAccessibleDescription(/https:\/\//);
  });

  it('keeps what you typed and says why when the save fails', async () => {
    const user = userEvent.setup();
    ctx.setClassExternalTasksUrl.mockRejectedValue(new Error('Failed to update the tasks link'));
    renderSettings(cls('cse-115a', null));
    await user.type(linkBox(), JOB_BOARD);
    await user.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update the tasks link');
    expect(linkBox()).toHaveValue(JOB_BOARD);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
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

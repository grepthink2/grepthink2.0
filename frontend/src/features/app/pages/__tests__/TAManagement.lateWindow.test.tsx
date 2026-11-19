/** TA Management: the instructor lets each TA open late windows, and sees how many each has opened. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClassTA } from '@/lib/api';

const CLASS = vi.hoisted(() => ({
  id: 'c1',
  name: 'CSE 115C',
  course_code: 'ABC123',
  created_by: 'me',
  created_at: '2026-01-01',
}));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: CLASS }),
}));
vi.mock('@/lib/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ApiError,
    api: {
      getClassStudents: vi.fn(),
      getClassProjects: vi.fn(),
      getClassTAs: vi.fn(),
      setTALateWindowPermission: vi.fn(),
    },
  };
});

import { api, ApiError } from '@/lib/api';
import TAManagement from '../TAManagement';

const TARA: ApiClassTA = {
  id: 'u1',
  name: 'Tara Singh',
  email: 'tsingh@ucsc.edu',
  projects: [],
  can_extend_deadlines: true,
  late_windows_opened: 3,
};
const UMAR: ApiClassTA = {
  id: 'u2',
  name: 'Umar Haddad',
  email: 'uhaddad@ucsc.edu',
  projects: [],
  can_extend_deadlines: false,
  late_windows_opened: 0,
};
const VIC: ApiClassTA = {
  id: 'u3',
  name: 'Vic Moreno',
  email: 'vmoreno@ucsc.edu',
  projects: [],
  can_extend_deadlines: true,
  late_windows_opened: 1,
};

/** The card of the TA with this name. */
const card = (name: string) => screen.getByText(name).closest('li')!;
/** That TA's late-window switch (its accessible name starts with the TA's name). */
const lateWindowSwitch = (name: string) =>
  within(card(name)).getByRole('switch', { name: /Can open late windows/ });

async function openPage() {
  const user = userEvent.setup();
  render(<TAManagement />);
  await screen.findByText('Tara Singh');
  return user;
}

describe('TA Management: the late-window permission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getClassStudents).mockResolvedValue({ students: [] });
    vi.mocked(api.getClassProjects).mockResolvedValue({ projects: [] });
    vi.mocked(api.getClassTAs).mockResolvedValue({ tas: [TARA, UMAR, VIC] });
  });

  it("shows each TA's switch and how many late windows they have opened", async () => {
    await openPage();

    const tara = lateWindowSwitch('Tara Singh');
    expect(tara).toBeChecked();
    expect(tara).toHaveAccessibleName('Tara Singh Can open late windows');
    expect(tara).toHaveAccessibleDescription('3 late windows opened');
    expect(within(card('Tara Singh')).getByText('3 late windows opened')).toBeInTheDocument();
    expect(lateWindowSwitch('Umar Haddad')).not.toBeChecked();
    expect(within(card('Umar Haddad')).getByText('none yet')).toBeInTheDocument();
    expect(lateWindowSwitch('Vic Moreno')).toBeChecked();
    expect(within(card('Vic Moreno')).getByText('1 late window opened')).toBeInTheDocument();
    expect(screen.queryByText(/extension/i)).not.toBeInTheDocument();
  });

  it('saves a flipped switch and patches the card without loading the TAs again', async () => {
    vi.mocked(api.setTALateWindowPermission).mockImplementation(async (_classId, userId, canExtend) => ({
      user_id: userId,
      can_extend_deadlines: canExtend,
    }));
    const user = await openPage();

    await user.click(lateWindowSwitch('Umar Haddad'));
    expect(api.setTALateWindowPermission).toHaveBeenCalledWith('c1', 'u2', true);
    await waitFor(() => expect(lateWindowSwitch('Umar Haddad')).toBeChecked());
    expect(api.getClassTAs).toHaveBeenCalledTimes(1);
    expect(within(card('Umar Haddad')).getByText('none yet')).toBeInTheDocument();

    await user.click(lateWindowSwitch('Tara Singh'));
    expect(api.setTALateWindowPermission).toHaveBeenLastCalledWith('c1', 'u1', false);
    await waitFor(() => expect(lateWindowSwitch('Tara Singh')).not.toBeChecked());
    expect(api.setTALateWindowPermission).toHaveBeenCalledTimes(2);
    expect(api.getClassTAs).toHaveBeenCalledTimes(1);
  });

  it("keeps a card busy until its own change answers, even when another card's answers first", async () => {
    const answers: Array<() => void> = [];
    vi.mocked(api.setTALateWindowPermission).mockImplementation(
      (_classId, userId, canExtend) =>
        new Promise((resolve) => {
          answers.push(() => resolve({ user_id: userId, can_extend_deadlines: canExtend }));
        }),
    );
    const user = await openPage();

    await user.click(lateWindowSwitch('Umar Haddad'));
    await user.click(lateWindowSwitch('Tara Singh'));
    expect(lateWindowSwitch('Tara Singh')).toBeDisabled();

    answers[0]();
    await waitFor(() => expect(lateWindowSwitch('Umar Haddad')).toBeChecked());
    expect(lateWindowSwitch('Tara Singh')).toBeDisabled();

    answers[1]();
    await waitFor(() => expect(lateWindowSwitch('Tara Singh')).toBeEnabled());
    expect(lateWindowSwitch('Tara Singh')).not.toBeChecked();
  });

  it('shows a refused change in the alert box and does not load the TAs again', async () => {
    vi.mocked(api.setTALateWindowPermission).mockRejectedValue(
      new ApiError(403, 'Only the class instructor can change this', 'Request failed'),
    );
    const user = await openPage();

    await user.click(lateWindowSwitch('Umar Haddad'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Only the class instructor can change this');
    expect(api.getClassTAs).toHaveBeenCalledTimes(1);
    expect(lateWindowSwitch('Umar Haddad')).not.toBeChecked();
    expect(lateWindowSwitch('Umar Haddad')).toBeEnabled();
  });
});

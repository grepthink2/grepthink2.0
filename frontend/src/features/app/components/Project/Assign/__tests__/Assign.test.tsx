import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApiProject,
  ApiStaffingAssignmentRow,
  ApiStaffingProjectRank,
  ApiStaffingStudent,
} from '@/lib/api';
import Assign from '../Assign';

const classState = vi.hoisted(() => ({ selectedClass: { id: 'class-1', name: 'CSE115C' } }));

vi.mock('@/lib/classContext', () => ({ useClass: () => classState }));

vi.mock('@/lib/api', () => ({
  api: {
    getStaffingProjectRank: vi.fn(),
    getStaffingStudents: vi.fn(),
    getStaffingAssignments: vi.fn(),
    updateProject: vi.fn(),
    staffingAssign: vi.fn(),
  },
}));

// Imported after the mocks so this binding is the mocked module.
import { api } from '@/lib/api';

// Robot Arm has 3 empty seats, and Ada is not placed yet.
const ROBOT_ARM: ApiStaffingProjectRank = {
  project_id: 'project-1',
  project_name: 'Robot Arm',
  breadth: 2,
  depth: 3,
  strength: 4.5,
  num_staff: 0,
  team_size: 3,
  availability: 3,
  breadth_rank: 1,
  depth_rank: 1,
  strength_rank: 1,
  sum_of_ranks: 3,
  total_rank: 1,
};
const ADA: ApiStaffingStudent = {
  user_id: 'user-1',
  user_name: 'Ada Lovelace',
  user_email: 'ada@ucsc.edu',
  submitted_at: null,
  taking_115c: true,
  previous_project_name: null,
  previous_project_link: null,
  notes: null,
  preferences: [],
  work_with: [],
  dont_work_with: [],
  assigned_project: null,
};
const ADA_UNPLACED: ApiStaffingAssignmentRow = {
  user_id: 'user-1',
  user_name: 'Ada Lovelace',
  user_email: 'ada@ucsc.edu',
  assigned_project_id: null,
  assigned_project_name: null,
  role: null,
};
const ROBOT_ARM_WITH_4_SEATS: ApiProject = {
  id: 'project-1',
  class_id: 'class-1',
  name: 'Robot Arm',
  created_by: 'instructor-1',
  created_at: '2026-09-01T00:00:00Z',
  team_size: 4,
};

const SEAT_ERROR = 'Could not change the team size';

function assignPage() {
  return (
    <MemoryRouter>
      <Assign />
    </MemoryRouter>
  );
}

/** Clicks a seat button, fails that change, and waits for the reload that follows. */
async function failSeatChange(user: UserEvent, seatButton: string) {
  vi.mocked(api.updateProject).mockRejectedValueOnce(new Error(SEAT_ERROR));
  await user.click(await screen.findByRole('button', { name: seatButton }));
  // The click changes the count at once; the reload restores the server's 3 seats.
  await waitFor(() => expect(screen.getByText('0 / 3')).toBeInTheDocument());
  expect(api.getStaffingProjectRank).toHaveBeenCalledTimes(2);
}

describe('Assign', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    classState.selectedClass = { id: 'class-1', name: 'CSE115C' };
    // Every load succeeds, the reload after a failed action included.
    vi.mocked(api.getStaffingProjectRank).mockResolvedValue({ projects: [ROBOT_ARM] });
    vi.mocked(api.getStaffingStudents).mockResolvedValue({ students: [ADA] });
    vi.mocked(api.getStaffingAssignments).mockResolvedValue({ assignments: [ADA_UNPLACED] });
  });

  it.each(['Add a seat', 'Remove a seat'])(
    'keeps the error from a failed "%s" after the reload',
    async (seatButton) => {
      const user = userEvent.setup();
      render(assignPage());

      await failSeatChange(user, seatButton);

      expect(screen.getByText(SEAT_ERROR)).toBeInTheDocument();
    },
  );

  it('keeps the error from a failed save after the reload', async () => {
    vi.mocked(api.staffingAssign).mockRejectedValue(new Error('Could not save the placement'));
    const user = userEvent.setup();
    render(assignPage());

    // Place Ada in the focused project, then save that draft.
    await user.click(
      await screen.findByRole('button', { name: 'Add Ada Lovelace to focused project' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save assignments' }));

    // Saving ends once the reload that follows the failure is done.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save assignments' })).toBeEnabled(),
    );
    expect(api.getStaffingAssignments).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Could not save the placement')).toBeInTheDocument();
  });

  it('keeps the save confirmation after the reload', async () => {
    vi.mocked(api.staffingAssign).mockResolvedValue({
      message: 'Student assigned',
      user_id: 'user-1',
      project_id: 'project-1',
    });
    const user = userEvent.setup();
    render(assignPage());

    // Place Ada in the focused project, then save that draft.
    await user.click(
      await screen.findByRole('button', { name: 'Add Ada Lovelace to focused project' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save assignments' }));

    // Saving ends once the reload that follows the save is done.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save assignments' })).toBeEnabled(),
    );
    expect(api.getStaffingAssignments).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Assignments saved and applied.')).toBeInTheDocument();
  });

  it('clears the error when the next seat change starts', async () => {
    vi.mocked(api.updateProject).mockResolvedValue({
      message: 'Project updated',
      project: ROBOT_ARM_WITH_4_SEATS,
    });
    const user = userEvent.setup();
    render(assignPage());
    await failSeatChange(user, 'Add a seat');
    expect(screen.getByText(SEAT_ERROR)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add a seat' }));

    expect(screen.getByText('0 / 4')).toBeInTheDocument();
    expect(screen.queryByText(SEAT_ERROR)).not.toBeInTheDocument();
  });

  it('clears the error when another class is selected', async () => {
    const user = userEvent.setup();
    const { rerender } = render(assignPage());
    await failSeatChange(user, 'Add a seat');
    expect(screen.getByText(SEAT_ERROR)).toBeInTheDocument();

    classState.selectedClass = { id: 'class-2', name: 'CSE115D' };
    rerender(assignPage());

    await screen.findByRole('button', { name: 'Add a seat' });
    expect(api.getStaffingProjectRank).toHaveBeenLastCalledWith('class-2');
    expect(screen.queryByText(SEAT_ERROR)).not.toBeInTheDocument();
  });
});

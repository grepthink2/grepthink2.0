import { render, screen, waitFor } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiProject, ApiStaffingProjectRank } from '@/lib/api';
import Staffing from '../Staffing';

const classState = vi.hoisted(() => ({ selectedClass: { id: 'class-1', name: 'CSE115C' } }));

vi.mock('@/lib/classContext', () => ({ useClass: () => classState }));

vi.mock('@/lib/api', () => ({
  api: {
    getStaffingProjectRank: vi.fn(),
    getStaffingAssignments: vi.fn(),
    updateProject: vi.fn(),
  },
}));

// Imported after the mocks so this binding is the mocked module.
import { api } from '@/lib/api';

// Robot Arm has 3 empty seats.
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
const ROBOT_ARM_WITH_4_SEATS: ApiProject = {
  id: 'project-1',
  class_id: 'class-1',
  name: 'Robot Arm',
  created_by: 'instructor-1',
  created_at: '2026-09-01T00:00:00Z',
  team_size: 4,
};

const SEAT_ERROR = 'Could not change the team size';

function staffingPage() {
  return (
    <MemoryRouter>
      <Staffing />
    </MemoryRouter>
  );
}

/** The table cell with Robot Arm's seat count between its − and + buttons. */
function robotArmSeats() {
  return screen.getByRole('button', { name: 'Add seat to Robot Arm' }).closest('td');
}

/** Clicks a seat button, fails that change, and waits for the reload that follows. */
async function failSeatChange(user: UserEvent, seatButton: string) {
  vi.mocked(api.updateProject).mockRejectedValueOnce(new Error(SEAT_ERROR));
  await user.click(await screen.findByRole('button', { name: seatButton }));
  // The click changes the count at once; the reload restores the server's 3 seats.
  await waitFor(() => expect(robotArmSeats()).toHaveTextContent('3'));
  expect(api.getStaffingProjectRank).toHaveBeenCalledTimes(2);
}

describe('Staffing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    classState.selectedClass = { id: 'class-1', name: 'CSE115C' };
    // Every load succeeds, the reload after a failed seat change included.
    vi.mocked(api.getStaffingProjectRank).mockResolvedValue({ projects: [ROBOT_ARM] });
    vi.mocked(api.getStaffingAssignments).mockResolvedValue({ assignments: [] });
  });

  it.each(['Add seat to Robot Arm', 'Remove seat from Robot Arm'])(
    'keeps the error from a failed "%s" after the reload',
    async (seatButton) => {
      const user = userEvent.setup();
      render(staffingPage());

      await failSeatChange(user, seatButton);

      expect(screen.getByText(SEAT_ERROR)).toBeInTheDocument();
    },
  );

  it('clears the error when the next seat change starts', async () => {
    vi.mocked(api.updateProject).mockResolvedValue({
      message: 'Project updated',
      project: ROBOT_ARM_WITH_4_SEATS,
    });
    const user = userEvent.setup();
    render(staffingPage());
    await failSeatChange(user, 'Add seat to Robot Arm');
    expect(screen.getByText(SEAT_ERROR)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add seat to Robot Arm' }));

    expect(robotArmSeats()).toHaveTextContent('4');
    expect(screen.queryByText(SEAT_ERROR)).not.toBeInTheDocument();
  });

  it('clears the error when another class is selected', async () => {
    const user = userEvent.setup();
    const { rerender } = render(staffingPage());
    await failSeatChange(user, 'Add seat to Robot Arm');
    expect(screen.getByText(SEAT_ERROR)).toBeInTheDocument();

    classState.selectedClass = { id: 'class-2', name: 'CSE115D' };
    rerender(staffingPage());

    await screen.findByRole('button', { name: 'Add seat to Robot Arm' });
    expect(api.getStaffingProjectRank).toHaveBeenLastCalledWith('class-2');
    expect(screen.queryByText(SEAT_ERROR)).not.toBeInTheDocument();
  });
});

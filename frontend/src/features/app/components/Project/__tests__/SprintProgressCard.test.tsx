import type { ComponentProps } from 'react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiScrumBoard, ApiScrumSprint } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { makeBoard, makeStory, makeTask } from '@features/scrum/__tests__/fixtures';

const getScrumBoard = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { getScrumBoard } }));

import SprintProgressCard from '../SprintProgressCard';

type Props = ComponentProps<typeof SprintProgressCard>;

function card(props: Partial<Props> = {}) {
  return (
    <MemoryRouter>
      <SprintProgressCard projectId="p1" {...props} />
    </MemoryRouter>
  );
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const section = () => screen.getByRole('region', { name: 'Sprint progress' });
const boardLink = () => screen.queryByRole('link', { name: /open board/i });
/** The number beside a count's label: the <dd> after its <dt>. */
const countFor = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;

const sprint2: ApiScrumSprint = {
  id: 'sp2', name: 'Sprint 2', starts_at: '2026-09-07', ends_at: '2026-09-20', status: 'active',
};

/** Sprint 2 under way: 2 tasks to do, 1 in progress, 3 done, and one story in the backlog. */
function activeBoard(): ApiScrumBoard {
  return makeBoard({
    sprints: [sprint2],
    sprint_id: 'sp2',
    stories: [
      makeStory({
        id: 's1',
        sprint_id: 'sp2',
        tasks: [
          makeTask({ id: 't1', status: 'todo' }),
          makeTask({ id: 't2', status: 'todo' }),
          makeTask({ id: 't3', status: 'in_progress' }),
        ],
      }),
      makeStory({
        id: 's2',
        key: 'US-2',
        sprint_id: 'sp2',
        tasks: [
          makeTask({ id: 't4', story_id: 's2', status: 'done' }),
          makeTask({ id: 't5', story_id: 's2', status: 'done' }),
          makeTask({ id: 't6', story_id: 's2', status: 'done' }),
        ],
      }),
    ],
    backlog: [makeStory({ id: 's3', key: 'US-3', sprint_id: null })],
  });
}

describe('SprintProgressCard', () => {
  beforeEach(() => {
    getScrumBoard.mockReset();
  });

  it('is busy until the board arrives, and links to the board meanwhile', () => {
    getScrumBoard.mockReturnValue(new Promise(() => {}));
    render(card());

    expect(section()).toHaveAttribute('aria-busy', 'true');
    expect(getScrumBoard).toHaveBeenCalledWith('p1');
    expect(boardLink()).toHaveAttribute('href', '/app/projects/p1/board');
  });

  it("shows the sprint's dates and status, its task counts and progress, the backlog, and a link to the board", async () => {
    getScrumBoard.mockResolvedValue(activeBoard());
    render(card());

    expect(await screen.findByText('Sprint 2')).toBeInTheDocument();
    expect(section()).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(/Sep 7 – Sep 20/)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(countFor('To do')).toHaveTextContent(/^2$/);
    expect(countFor('In progress')).toHaveTextContent(/^1$/);
    expect(countFor('Done')).toHaveTextContent(/^3$/);
    expect(screen.getByRole('progressbar', { name: 'Tasks done' })).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('1 story in the backlog')).toBeInTheDocument();
    expect(boardLink()).toHaveAttribute('href', '/app/projects/p1/board');
  });

  it('says when the project has no sprints yet, and still links to the board', async () => {
    getScrumBoard.mockResolvedValue(makeBoard({ sprints: [], sprint_id: null }));
    render(card());

    expect(await screen.findByText('No sprints yet')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(boardLink()).toHaveAttribute('href', '/app/projects/p1/board');
  });

  it('tells someone outside the team and staff why there is nothing to see, with no link', async () => {
    getScrumBoard.mockRejectedValue(new ApiError(403, 'Forbidden', 'Forbidden'));
    render(card());

    expect(await screen.findByText('Only the team and class staff can see the board.')).toBeInTheDocument();
    expect(boardLink()).not.toBeInTheDocument();
  });

  it('says when the board fails to load, and still links to it', async () => {
    getScrumBoard.mockRejectedValue(new Error('boom'));
    render(card());

    expect(await screen.findByText('Couldn’t load the board.')).toBeInTheDocument();
    expect(boardLink()).toHaveAttribute('href', '/app/projects/p1/board');
  });

  it('loads the board again for a new project, with the skeleton up meanwhile', async () => {
    const next = deferred<ApiScrumBoard>();
    getScrumBoard.mockResolvedValueOnce(activeBoard()).mockReturnValueOnce(next.promise);
    const { rerender } = render(card());
    expect(await screen.findByText('Sprint 2')).toBeInTheDocument();

    rerender(card({ projectId: 'p2' }));
    expect(getScrumBoard).toHaveBeenCalledTimes(2);
    expect(getScrumBoard).toHaveBeenLastCalledWith('p2');
    expect(section()).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Sprint 2')).not.toBeInTheDocument();

    next.resolve(makeBoard()); // p2 is on Sprint 1, with nothing in the backlog
    expect(await screen.findByText('Sprint 1')).toBeInTheDocument();
    expect(screen.getByText('0 stories in the backlog')).toBeInTheDocument();
    expect(boardLink()).toHaveAttribute('href', '/app/projects/p2/board');
  });

  it('drops a late response for the project it showed before', async () => {
    const late = deferred<ApiScrumBoard>();
    getScrumBoard.mockReturnValueOnce(late.promise).mockResolvedValueOnce(activeBoard());
    const { rerender } = render(card());
    rerender(card({ projectId: 'p2' }));
    expect(await screen.findByText('Sprint 2')).toBeInTheDocument();

    // p1's board (Sprint 1) lands after p2's.
    await act(async () => {
      late.resolve(makeBoard());
      await late.promise;
    });
    expect(screen.getByText('Sprint 2')).toBeInTheDocument();
    expect(screen.queryByText('Sprint 1')).not.toBeInTheDocument();
  });
});

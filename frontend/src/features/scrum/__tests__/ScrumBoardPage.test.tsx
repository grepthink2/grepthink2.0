import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Profiler } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { ApiScrumBoard } from '@/lib/api';
import ScrumBoardPage, { ScrumBoardSkeleton } from '../pages/ScrumBoardPage';
import { BOARD_VIEWS } from '../config/boardViews';
import { makeBoard, makeRef, makeSprint, makeStory, makeTask } from './fixtures';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { email: 'tony@ucsc.edu', user_metadata: { full_name: 'Tony Wu' } } }),
}));
vi.mock('@/lib/api', () => ({
  api: {
    getScrumBoard: vi.fn(),
    moveScrumTask: vi.fn(),
    refreshScrumPrStates: vi.fn(),
    updateStory: vi.fn(),
    createStory: vi.fn(),
    createScrumTask: vi.fn(),
    deleteScrumTask: vi.fn(),
    deleteScrumStory: vi.fn(),
    getScrumComments: vi.fn(),
    createScrumComment: vi.fn(),
    getScrumRepos: vi.fn(),
    addScrumRepo: vi.fn(),
    deleteScrumRepo: vi.fn(),
    updateScrumSettings: vi.fn(),
    addTaskDependency: vi.fn(),
    removeTaskDependency: vi.fn(),
  },
}));
const { api } = await import('@/lib/api');

const TWO_SPRINTS = [
  makeSprint(),
  makeSprint({ id: 'sp2', name: 'Sprint 2', starts_at: '2026-08-24', ends_at: '2026-09-06' }),
];

const boardFixture = (over: Partial<ApiScrumBoard> = {}) => makeBoard({
  stories: [
    makeStory({
      id: 's1', key: 'US-1', title: 'Login flow', points: 8,
      tasks: [
        makeTask({ id: 'a', key: 'T-1', title: 'Build form', status: 'todo' }),
        makeTask({ id: 'b', key: 'T-2', title: 'Wire session', status: 'done' }),
      ],
    }),
    makeStory({ id: 's2', key: 'US-2', title: 'Roster import', tasks: [
      makeTask({ id: 'c', story_id: 's2', key: 'T-3', title: 'Parse CSV', status: 'in_progress' }),
    ] }),
  ],
  backlog: [makeStory({ id: 's9', key: 'US-9', title: 'Old idea', sprint_id: null })],
  ...over,
});

/** getScrumBoard for a board on Sprint 1 of two, with one story in Sprint 2 when that is asked for. */
const answerForSprintTwo = async (_projectId: string, sprintId?: string) =>
  sprintId === 'sp2'
    ? boardFixture({
        sprint_id: 'sp2',
        sprints: TWO_SPRINTS,
        stories: [makeStory({ id: 's3', key: 'US-3', title: 'Sprint two story', tasks: [] })],
      })
    : boardFixture({ sprints: TWO_SPRINTS });

/** Location probe: the URL the page has navigated to, query included. */
function Where() {
  const loc = useLocation();
  return <output data-testid="path">{loc.pathname + loc.search}</output>;
}

const renderAt = (entry = '/app/projects/p1/board') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/projects/:projectId/board" element={<ScrumBoardPage />} />
      </Routes>
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(api.getScrumBoard).mockReset().mockResolvedValue(boardFixture());
  vi.mocked(api.refreshScrumPrStates).mockReset().mockResolvedValue({ updated: {} });
  vi.mocked(api.moveScrumTask).mockReset();
  vi.mocked(api.updateStory).mockReset();
  vi.mocked(api.createScrumTask).mockReset();
  vi.mocked(api.createStory).mockReset();
  vi.mocked(api.deleteScrumStory).mockReset();
  vi.mocked(api.getScrumComments).mockReset().mockResolvedValue({ comments: [] });
  vi.mocked(api.createScrumComment).mockReset();
  vi.mocked(api.getScrumRepos).mockReset().mockResolvedValue({ repos: [] });
  vi.mocked(api.addScrumRepo).mockReset();
  vi.mocked(api.addTaskDependency).mockReset();
  vi.mocked(api.removeTaskDependency).mockReset();
});

describe('ScrumBoardPage tabs', () => {
  it('renders the three full-width sub-views (L2)', async () => {
    renderAt();
    await screen.findByRole('tab', { name: 'Board' });
    expect(BOARD_VIEWS).toEqual(['board', 'backlog', 'burnup']);
    ['Board', 'Backlog', 'Burnup'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
  });

  it('defaults to Board and follows ?view=', async () => {
    renderAt('/app/projects/p1/board?view=burnup');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Burnup' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('falls back to Board for an unknown view', async () => {
    renderAt('/app/projects/p1/board?view=nonsense');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true'));
  });

  it('switches tabs and shows that tab’s content', async () => {
    renderAt();
    await screen.findByText('Login flow');

    await userEvent.click(screen.getByRole('tab', { name: 'Backlog' }));
    expect(await screen.findByText('Old idea')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Burnup' }));
    expect(await screen.findByText('Cumulative burnup')).toBeInTheDocument();
  });
});

describe('ScrumBoardPage board view', () => {
  it('shows the story strip and every sprint task on the columns', async () => {
    renderAt();
    expect(await screen.findByText('Login flow')).toBeInTheDocument();
    expect(screen.getByText('Roster import')).toBeInTheDocument();
    expect(screen.getByText('Build form')).toBeInTheDocument();
    expect(screen.getByText('Parse CSV')).toBeInTheDocument();
  });

  it('filters the columns to one story and clears again', async () => {
    renderAt();
    await screen.findByText('Login flow');

    await userEvent.click(screen.getByRole('button', { name: /Login flow/ }));
    expect(screen.queryByText('Parse CSV')).not.toBeInTheDocument();  // other story's task hidden
    expect(screen.getByText('Build form')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show all/i }));
    expect(await screen.findByText('Parse CSV')).toBeInTheDocument();
  });
});

describe('ScrumBoardPage story detail', () => {
  it('opens the task itself, not its story, and goes back to the story', async () => {
    renderAt();
    await userEvent.click(await screen.findByText('Build form'));

    // The task's own editor, with the parent story only as a back reference.
    const editor = await screen.findByRole('dialog');
    expect(within(editor).getByRole('heading', { name: /edit t-1/i })).toBeInTheDocument();
    expect(within(editor).getByLabelText('Title')).toHaveValue('Build form');
    // Never both at once.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    await userEvent.click(within(editor).getByRole('button', { name: /back to US-1 Login flow/i }));
    const story = await screen.findByRole('dialog');
    expect(within(story).getByText('Login flow')).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    await userEvent.click(within(story).getByRole('button', { name: /close story/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens a story from its card without opening any task', async () => {
    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'Open US-1' }));

    const story = await screen.findByRole('dialog');
    expect(within(story).getByText('TODO')).toBeInTheDocument();      // T-1's status, as text
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('opens the task straight from a ?task= deep link (mention notifications)', async () => {
    renderAt('/app/projects/p1/board?task=c');
    const dialog = await screen.findByRole('dialog');
    // The task, with its story carried only as the back reference.
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Parse CSV');
    expect(within(dialog).getByRole('button', { name: /back to US-2 Roster import/i })).toBeInTheDocument();
  });

  it("moves a task from the task editor's status select", async () => {
    vi.mocked(api.moveScrumTask).mockResolvedValue({ message: 'ok', task: makeTask({ id: 'a', status: 'done' }) });
    renderAt();
    await userEvent.click(await screen.findByText('Build form'));
    const editor = await screen.findByRole('dialog', { name: /edit t-1/i });

    // The keyboard path for drag and drop.
    await userEvent.selectOptions(within(editor).getByLabelText('Status'), 'done');
    expect(api.moveScrumTask).toHaveBeenCalledWith('a', 'done');
  });

  it("gives staff no Status select in the task editor", async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue({ ...boardFixture(), access: 'staff' });
    renderAt('/app/projects/p1/board?task=a');
    const editor = await screen.findByRole('dialog', { name: /edit t-1/i });
    expect(within(editor).queryByLabelText('Status')).toBeNull();
  });

  it('offers no Status select for a task of a backlog story', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(boardFixture({
      backlog: [makeStory({
        id: 's9', key: 'US-9', title: 'Old idea', sprint_id: null,
        tasks: [makeTask({ id: 'z', story_id: 's9', key: 'T-9', title: 'Sketch it' })],
      })],
    }));
    renderAt('/app/projects/p1/board?task=z');
    const editor = await screen.findByRole('dialog', { name: /edit t-9/i });
    expect(within(editor).queryByLabelText('Status')).toBeNull();
  });

  it('moves a backlog story to the shown sprint', async () => {
    vi.mocked(api.updateStory).mockResolvedValue({ message: 'ok', story: makeStory({ id: 's9', sprint_id: 'sp1' }) });
    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('tab', { name: 'Backlog' }));

    await userEvent.click(await screen.findByRole('button', { name: 'Move US-9 to Sprint 1' }));
    expect(api.updateStory).toHaveBeenCalledWith('s9', { sprint_id: 'sp1' });
  });

  it('deletes a backlog story and closes it', async () => {
    vi.mocked(api.deleteScrumStory).mockResolvedValue(undefined);
    renderAt('/app/projects/p1/board?view=backlog&story=s9');
    const story = await screen.findByRole('dialog');
    vi.mocked(api.getScrumBoard).mockResolvedValue(boardFixture({ backlog: [] }));   // the refetch

    await userEvent.click(within(story).getByRole('button', { name: 'Delete story' }));
    const confirm = within(story).getByRole('alertdialog');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete story' }));

    expect(api.deleteScrumStory).toHaveBeenCalledWith('s9');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board?view=backlog'));
  });

  it('deleting a story also drops a stale ?task=', async () => {
    vi.mocked(api.deleteScrumStory).mockResolvedValue(undefined);
    // ?task= names no task on this board (else its editor, not the story, would be open).
    renderAt('/app/projects/p1/board?view=backlog&story=s9&task=gone');
    const story = await screen.findByRole('dialog');
    vi.mocked(api.getScrumBoard).mockResolvedValue(boardFixture({ backlog: [] }));

    await userEvent.click(within(story).getByRole('button', { name: 'Delete story' }));
    await userEvent.click(within(within(story).getByRole('alertdialog')).getByRole('button', { name: 'Delete story' }));

    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board?view=backlog'));
  });

  it('offers no Delete story for a sprint story', async () => {
    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'Open US-1' }));
    const story = await screen.findByRole('dialog');
    expect(within(story).queryByRole('button', { name: 'Delete story' })).toBeNull();
  });

  it('a refused delete keeps the story open and explains', async () => {
    vi.mocked(api.deleteScrumStory).mockRejectedValue(
      new Error('Move the story to the backlog before deleting it'),
    );
    renderAt('/app/projects/p1/board?view=backlog&story=s9');
    const story = await screen.findByRole('dialog');

    await userEvent.click(within(story).getByRole('button', { name: 'Delete story' }));
    await userEvent.click(within(within(story).getByRole('alertdialog')).getByRole('button', { name: 'Delete story' }));

    expect(await screen.findByText('Move the story to the backlog before deleting it')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getByText('Old idea')).toBeInTheDocument();
  });

  it('adds a task to the open story through the task editor', async () => {
    vi.mocked(api.createScrumTask).mockResolvedValue({ message: 'ok', task: makeTask() });
    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'Open US-1' }));
    const story = await screen.findByRole('dialog');

    await userEvent.click(within(story).getByRole('button', { name: /add task/i }));
    const editor = await screen.findByRole('dialog', { name: /new task in US-1/i });
    // The story detail is gone, not merely covered.
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await userEvent.type(within(editor).getByLabelText('Title'), 'Write docs');
    await userEvent.click(within(editor).getByRole('button', { name: 'Add task' }));

    expect(api.createScrumTask).toHaveBeenCalledWith('s1', { title: 'Write docs' });
  });
});

describe('ScrumBoardPage create story (F13)', () => {
  it('opens the editor from the header button', async () => {
    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'New Story' }));
    expect(await screen.findByRole('dialog', { name: /new story/i })).toBeInTheDocument();
  });

  it('creates the story and lands in it so tasks can be added next', async () => {
    const created = makeStory({ id: 'new1', key: 'US-9', title: 'Weather overlay', tasks: [] });
    vi.mocked(api.createStory).mockResolvedValue({ message: 'ok', story: created });
    vi.mocked(api.getScrumBoard).mockResolvedValue({
      ...boardFixture(), stories: [...boardFixture().stories, created],
    });

    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'New Story' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Weather overlay');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));

    expect(api.createStory).toHaveBeenCalledWith('p1', { title: 'Weather overlay', sprint_id: 'sp1' });
    // The editor closes and the new story's detail opens — the flow continues.
    const dialog = await screen.findByRole('dialog', { name: /weather overlay/i });
    expect(within(dialog).getByRole('button', { name: /add task/i })).toBeInTheDocument();
  });

  it('keeps the editor open when creation fails', async () => {
    vi.mocked(api.createStory).mockRejectedValue(new Error('offline'));
    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'New Story' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Doomed');
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));

    expect(await screen.findByRole('dialog', { name: /new story/i })).toBeInTheDocument();
  });
});

describe('ScrumBoardPage states', () => {
  it('renders a skeleton while loading', () => {
    render(<ScrumBoardSkeleton />);
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('explains an empty sprint rather than showing bare columns', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue(makeBoard({ sprints: [], sprint_id: null, stories: [] }));
    renderAt();
    expect(await screen.findByText('No sprints yet')).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    vi.mocked(api.getScrumBoard).mockRejectedValue(new Error('backend unreachable'));
    renderAt();
    expect(await screen.findByText('Unable to load the board')).toBeInTheDocument();
    expect(screen.getByText('backend unreachable')).toBeInTheDocument();
  });

  it('hides write affordances from staff viewers', async () => {
    vi.mocked(api.getScrumBoard).mockResolvedValue({ ...boardFixture(), access: 'staff' });
    renderAt();
    await screen.findByText('Login flow');
    expect(screen.getByRole('button', { name: 'New Story' })).toBeDisabled();
    // Switching sprints is a read: staff keep the picker.
    expect(screen.getByRole('button', { name: 'Sprint: Sprint 1' })).toBeEnabled();
  });
});

describe('ScrumBoardPage sprint picker', () => {
  it('switches sprints from the picker and hands focus back to it', async () => {
    vi.mocked(api.getScrumBoard).mockImplementation(answerForSprintTwo);
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Sprint: Sprint 1' }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /^Sprint 2/ }));

    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp2');
    expect(await screen.findByText('Sprint two story')).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Sprint: Sprint 2' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('ScrumBoardPage deep links (global search)', () => {
  it('opens the story named by ?story= once the board has loaded', async () => {
    renderAt('/app/projects/p1/board?story=s2');
    const story = await screen.findByRole('dialog');
    expect(within(story).getByText('Roster import')).toBeInTheDocument();
  });

  it('opens a backlog story from ?view=backlog&story=', async () => {
    renderAt('/app/projects/p1/board?view=backlog&story=s9');
    const story = await screen.findByRole('dialog');
    expect(within(story).getByText('Old idea')).toBeInTheDocument();
  });

  it('switches to the sprint named by ?sprint=, drops the param, and then opens the story', async () => {
    vi.mocked(api.getScrumBoard).mockImplementation(answerForSprintTwo);
    renderAt('/app/projects/p1/board?sprint=sp2&story=s3');
    const story = await screen.findByRole('dialog');
    expect(within(story).getByText('Sprint two story')).toBeInTheDocument();
    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp2');
    // The picker names the sprint, but nothing had focus to give back to it.
    expect(screen.getByRole('button', { name: 'Sprint: Sprint 2' })).not.toHaveFocus();
  });

  it('ignores an unknown ?sprint= and keeps the default board', async () => {
    renderAt('/app/projects/p1/board?sprint=nope');
    await screen.findByRole('tab', { name: 'Board' });
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board'));
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Login flow')).toBeInTheDocument();
  });

  it('drops a ?sprint= naming the sprint already shown, without fetching the board again', async () => {
    renderAt('/app/projects/p1/board?sprint=sp1&story=s1');
    const story = await screen.findByRole('dialog');
    expect(within(story).getByText('Login flow')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board?story=s1'));
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);
  });

  it('closing the story clears ?story= and leaves the view alone', async () => {
    renderAt('/app/projects/p1/board?view=backlog&story=s9');
    const story = await screen.findByRole('dialog');
    await userEvent.click(within(story).getByRole('button', { name: /close story/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('aria-selected', 'true');
  });

  // Left in the URL, ?sprint= would pull the board back to that sprint whenever the user
  // picked another one in the sprint picker.
  it('consumes ?sprint= once: one sprint switch, then the param leaves the URL', async () => {
    vi.mocked(api.getScrumBoard).mockImplementation(answerForSprintTwo);
    renderAt('/app/projects/p1/board?sprint=sp2&story=s3');
    await screen.findByRole('dialog');
    await waitFor(() =>
      expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board?story=s3'));
    expect(api.getScrumBoard).toHaveBeenCalledTimes(2);
    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp2');
  });
});

describe('ScrumBoardPage dependencies', () => {
  // T-1 (Sprint 1) depends on T-8, in Sprint 2, and on T-9, in the backlog.
  const IN_SPRINT_TWO = makeRef({
    id: 'x', key: 'T-8', title: 'Sprint two task', story_id: 's3', story_key: 'US-3', sprint_id: 'sp2',
  });
  const IN_BACKLOG = makeRef({
    id: 'z', key: 'T-9', title: 'Sketch it', story_id: 's9', story_key: 'US-9', sprint_id: null,
  });
  /** In the index only: what the picker can still offer T-1. */
  const SPARE = makeRef({
    id: 'w', key: 'T-7', title: 'Spare', story_id: 's3', story_key: 'US-3', sprint_id: 'sp2',
  });
  const backlog = [makeStory({
    id: 's9', key: 'US-9', title: 'Old idea', sprint_id: null,
    tasks: [makeTask({ id: 'z', story_id: 's9', key: 'T-9', title: 'Sketch it' })],
  })];
  const answer = async (_projectId: string, sprintId?: string) =>
    sprintId === 'sp2'
      ? boardFixture({
          sprint_id: 'sp2', sprints: TWO_SPRINTS, backlog,
          stories: [makeStory({
            id: 's3', key: 'US-3', title: 'Sprint two story', sprint_id: 'sp2',
            tasks: [makeTask({ id: 'x', story_id: 's3', key: 'T-8', title: 'Sprint two task' })],
          })],
        })
      : boardFixture({
          sprints: TWO_SPRINTS, backlog, task_index: [SPARE, IN_SPRINT_TWO, IN_BACKLOG],
          stories: [makeStory({
            id: 's1', key: 'US-1', title: 'Login flow', points: 8,
            tasks: [makeTask({
              id: 'a', key: 'T-1', title: 'Build form', depends_on: [IN_SPRINT_TWO, IN_BACKLOG],
            })],
          })],
        });

  it('opens a dependency in another sprint by switching the board to it', async () => {
    vi.mocked(api.getScrumBoard).mockImplementation(answer);
    renderAt('/app/projects/p1/board?task=a');
    const editor = await screen.findByRole('dialog', { name: /edit t-1/i });

    await userEvent.click(within(editor).getByRole('button', { name: 'T-8' }));
    const next = await screen.findByRole('dialog', { name: /edit t-8/i });
    expect(within(next).getByLabelText('Title')).toHaveValue('Sprint two task');
    expect(api.getScrumBoard).toHaveBeenLastCalledWith('p1', 'sp2');
    // ?sprint= did its job and left: the picker is free to move on.
    await waitFor(() => expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board?task=x'));
  });

  it('opens a backlog dependency in place, without reloading the board', async () => {
    vi.mocked(api.getScrumBoard).mockImplementation(answer);
    renderAt('/app/projects/p1/board?task=a');
    const editor = await screen.findByRole('dialog', { name: /edit t-1/i });

    await userEvent.click(within(editor).getByRole('button', { name: 'T-9' }));
    const next = await screen.findByRole('dialog', { name: /edit t-9/i });
    expect(within(next).getByLabelText('Title')).toHaveValue('Sketch it');
    expect(api.getScrumBoard).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board?task=z');
  });

  it('adds and removes dependencies from the task editor, reloading the board', async () => {
    vi.mocked(api.getScrumBoard).mockImplementation(answer);
    vi.mocked(api.addTaskDependency).mockResolvedValue({ message: 'Dependency added', depends_on: [] });
    vi.mocked(api.removeTaskDependency).mockResolvedValue(undefined);
    renderAt('/app/projects/p1/board?task=a');
    const editor = await screen.findByRole('dialog', { name: /edit t-1/i });

    await userEvent.selectOptions(within(editor).getByLabelText('Add a dependency'), 'w');
    await userEvent.click(within(editor).getByRole('button', { name: 'Add' }));
    expect(api.addTaskDependency).toHaveBeenCalledWith('a', 'w');
    await waitFor(() => expect(api.getScrumBoard).toHaveBeenCalledTimes(2));

    await userEvent.click(within(editor).getByRole('button', { name: 'Remove dependency on T-9' }));
    expect(api.removeTaskDependency).toHaveBeenCalledWith('a', 'z');
    await waitFor(() => expect(api.getScrumBoard).toHaveBeenCalledTimes(3));
  });

  it('gives staff the lists without the controls', async () => {
    vi.mocked(api.getScrumBoard).mockImplementation(async (...args) => ({ ...await answer(...args), access: 'staff' }));
    renderAt('/app/projects/p1/board?task=a');
    const editor = await screen.findByRole('dialog', { name: /edit t-1/i });
    expect(within(editor).getByRole('button', { name: 'T-8' })).toBeInTheDocument();
    expect(within(editor).queryByLabelText('Add a dependency')).toBeNull();
    expect(within(editor).queryByRole('button', { name: /^Remove dependency/ })).toBeNull();
  });
});

// setSearchParams does not queue like setState: two calls in one event both start from that
// render's params and the last one wins. These handlers change two params at once.
describe('ScrumBoardPage URL params: one navigation per event', () => {
  it('opening a task from its story, then closing the editor, returns to the board', async () => {
    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'Open US-1' }));
    const story = await screen.findByRole('dialog');
    await userEvent.click(within(story).getByRole('button', { name: 'Build form' }));
    const editor = await screen.findByRole('dialog', { name: /edit t-1/i });
    await userEvent.click(within(editor).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('cancelling a new task returns to the board, not the story', async () => {
    renderAt();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'Open US-1' }));
    const story = await screen.findByRole('dialog');
    await userEvent.click(within(story).getByRole('button', { name: /add task/i }));
    const editor = await screen.findByRole('dialog', { name: /new task in US-1/i });
    await userEvent.click(within(editor).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('closing a story also drops a ?task= that names no task on this board', async () => {
    renderAt('/app/projects/p1/board?task=gone');
    await screen.findByText('Roster import');
    await userEvent.click(screen.getByRole('button', { name: 'Open US-2' }));
    const story = await screen.findByRole('dialog');
    await userEvent.click(within(story).getByRole('button', { name: /close story/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByTestId('path').textContent).toBe('/app/projects/p1/board');
  });
});

/**
 * The board at `/app/projects/p1/board`, recording how many dialogs are on screen after each
 * commit (a Profiler reports a commit once the DOM is updated).
 */
function renderCountingDialogs() {
  const dialogsPerCommit: number[] = [];
  render(
    <Profiler id="board" onRender={() => { dialogsPerCommit.push(document.querySelectorAll('[role="dialog"]').length); }}>
      <MemoryRouter initialEntries={['/app/projects/p1/board']}>
        <Routes>
          <Route path="/app/projects/:projectId/board" element={<ScrumBoardPage />} />
        </Routes>
      </MemoryRouter>
    </Profiler>,
  );
  return dialogsPerCommit;
}

// A swap that closes one modal with local state and opens the next through the URL commits in two
// steps unless both share a transition (the router navigates in one): one commit with no modal.
describe('ScrumBoardPage modal swaps never commit an empty screen', () => {
  it('back from a new task closes the editor and opens the story in one commit', async () => {
    const dialogsPerCommit = renderCountingDialogs();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'Open US-1' }));
    const story = await screen.findByRole('dialog');
    await userEvent.click(within(story).getByRole('button', { name: /add task/i }));
    const editor = await screen.findByRole('dialog', { name: /new task in US-1/i });

    dialogsPerCommit.length = 0;
    await userEvent.click(within(editor).getByRole('button', { name: 'Back to US-1 Login flow' }));
    expect(await screen.findByRole('button', { name: /close story/i })).toBeInTheDocument();
    expect(dialogsPerCommit.length).toBeGreaterThan(0);
    expect(dialogsPerCommit).not.toContain(0);
  });

  it('a created story replaces the new-story editor in one commit', async () => {
    const created = makeStory({ id: 'new1', key: 'US-9', title: 'Weather overlay', tasks: [] });
    vi.mocked(api.createStory).mockResolvedValue({ message: 'ok', story: created });
    vi.mocked(api.getScrumBoard).mockResolvedValue({
      ...boardFixture(), stories: [...boardFixture().stories, created],
    });
    const dialogsPerCommit = renderCountingDialogs();
    await screen.findByText('Login flow');
    await userEvent.click(screen.getByRole('button', { name: 'New Story' }));
    await userEvent.type(screen.getByLabelText('Title'), 'Weather overlay');

    dialogsPerCommit.length = 0;
    await userEvent.click(screen.getByRole('button', { name: 'Create story' }));
    expect(await screen.findByRole('dialog', { name: /weather overlay/i })).toBeInTheDocument();
    expect(dialogsPerCommit.length).toBeGreaterThan(0);
    expect(dialogsPerCommit).not.toContain(0);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ScrumBoardPage, { ScrumBoardSkeleton, BOARD_VIEWS } from '../pages/ScrumBoardPage';
import { makeBoard, makeStory, makeTask } from './fixtures';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { email: 'tony@ucsc.edu', user_metadata: { full_name: 'Tony Wu' } } }),
}));
vi.mock('@/lib/api', () => ({
  api: {
    getScrumBoard: vi.fn(),
    moveScrumTask: vi.fn(),
    refreshScrumPrStates: vi.fn(),
    updateStory: vi.fn(),
    createScrumTask: vi.fn(),
    deleteScrumTask: vi.fn(),
    getScrumComments: vi.fn(),
    createScrumComment: vi.fn(),
    getScrumRepos: vi.fn(),
    addScrumRepo: vi.fn(),
    deleteScrumRepo: vi.fn(),
    updateScrumSettings: vi.fn(),
  },
}));
const { api } = await import('@/lib/api');

const boardFixture = () => makeBoard({
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
});

const renderAt = (entry = '/app/projects/p1/board') =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/projects/:projectId/board" element={<ScrumBoardPage />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.mocked(api.getScrumBoard).mockReset().mockResolvedValue(boardFixture());
  vi.mocked(api.refreshScrumPrStates).mockReset().mockResolvedValue({ updated: {} });
  vi.mocked(api.moveScrumTask).mockReset();
  vi.mocked(api.updateStory).mockReset();
  vi.mocked(api.createScrumTask).mockReset();
  vi.mocked(api.getScrumComments).mockReset().mockResolvedValue({ comments: [] });
  vi.mocked(api.createScrumComment).mockReset();
  vi.mocked(api.getScrumRepos).mockReset().mockResolvedValue({ repos: [] });
  vi.mocked(api.addScrumRepo).mockReset();
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
  it('opens a task’s story, focuses that task, and closes back', async () => {
    renderAt();
    await userEvent.click(await screen.findByText('Build form'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Login flow')).toBeInTheDocument();
    expect(within(dialog).getByRole('combobox', { name: /Status of T-1/ })).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: /close story/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens straight from a ?task= deep link (mention notifications)', async () => {
    renderAt('/app/projects/p1/board?task=c');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Roster import')).toBeInTheDocument();
  });

  it('moves a task from the status select — the keyboard path for DnD', async () => {
    vi.mocked(api.moveScrumTask).mockResolvedValue({ message: 'ok', task: makeTask({ id: 'a', status: 'done' }) });
    renderAt('/app/projects/p1/board?task=a');
    const dialog = await screen.findByRole('dialog');

    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: /Status of T-1/ }), 'done');
    expect(api.moveScrumTask).toHaveBeenCalledWith('a', 'done');
  });

  it('archives a story from the footer', async () => {
    vi.mocked(api.updateStory).mockResolvedValue({ message: 'ok', story: makeStory() });
    renderAt('/app/projects/p1/board?task=a');
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive story' }));
    expect(api.updateStory).toHaveBeenCalledWith('s1', { archived: true });
  });

  it('adds a task to the open story', async () => {
    vi.mocked(api.createScrumTask).mockResolvedValue({ message: 'ok', task: makeTask() });
    renderAt('/app/projects/p1/board?task=a');
    const dialog = await screen.findByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText('New task title'), 'Write docs');
    await userEvent.click(within(dialog).getByRole('button', { name: /add/i }));
    expect(api.createScrumTask).toHaveBeenCalledWith('s1', { title: 'Write docs' });
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
  });
});

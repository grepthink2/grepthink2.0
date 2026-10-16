import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StoryModal from '../components/StoryModal';
import { buildMemberMap } from '../scrumTypes';
import { makeMembers, makeStory, makeTask } from './fixtures';

vi.mock('@/lib/api', () => ({
  api: { getScrumComments: vi.fn(), createScrumComment: vi.fn() },
}));
const { api } = await import('@/lib/api');

// The story's comment thread loads on mount.
beforeEach(() => {
  vi.mocked(api.getScrumComments).mockReset().mockResolvedValue({ comments: [] });
  vi.mocked(api.createScrumComment).mockReset();
});

const setup = (storyOver = {}, over = {}) => {
  const props = {
    story: makeStory({ key: 'US-1', title: 'Trail search', description_md: 'Find by **name**', ...storyOver }),
    members: buildMemberMap(makeMembers()),
    sprints: [],
    scale: 'fibonacci' as const,
    canWrite: true,
    onClose: vi.fn(),
    onUpdateStory: vi.fn(),
    onOpenTask: vi.fn(),
    onAddTask: vi.fn(),
    onDeleteTask: vi.fn(),
    onDeleteStory: vi.fn(),
    onCommentError: vi.fn(),
    onCommentPosted: vi.fn(),
    ...over,
  };
  render(<StoryModal {...props} />);
  return props;
};

describe('StoryModal — editing the story (maintainer 2026-09-25)', () => {
  it('edits the title and description in place', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const title = screen.getByLabelText('Story title');
    expect(title).toHaveFocus();

    await userEvent.clear(title);
    await userEvent.type(title, 'Trail search and filters');
    await userEvent.clear(screen.getByLabelText('Description'));
    await userEvent.type(screen.getByLabelText('Description'), 'Filter by difficulty');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(p.onUpdateStory).toHaveBeenCalledWith({
      title: 'Trail search and filters', description_md: 'Filter by difficulty',
    });
    expect(screen.queryByLabelText('Story title')).toBeNull();   // back to reading
  });

  it('sends only what changed', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByLabelText('Description'), ' and region');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(p.onUpdateStory).toHaveBeenCalledWith({ description_md: 'Find by **name** and region' });
  });

  it('clears a description with an explicit null', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByLabelText('Description'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(p.onUpdateStory).toHaveBeenCalledWith({ description_md: null });
  });

  it('will not save an empty title', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByLabelText('Story title'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves with Ctrl+Enter from the description', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.type(screen.getByLabelText('Description'), '!');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    expect(p.onUpdateStory).toHaveBeenCalledWith({ description_md: 'Find by **name**!' });
  });

  it('backs out of an edit on Escape without closing the story', async () => {
    const p = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.keyboard('{Escape}');

    expect(p.onClose).not.toHaveBeenCalled();
    expect(p.onUpdateStory).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Trail search' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(p.onClose).toHaveBeenCalled();
  });

  it('offers to add a description when there is none', async () => {
    setup({ description_md: null });
    await userEvent.click(screen.getByRole('button', { name: 'Add a description' }));
    expect(screen.getByLabelText('Description')).toHaveFocus();
  });

  it('gives staff no way to edit', () => {
    setup({ description_md: null }, { canWrite: false });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a description' })).toBeNull();
  });
});

describe('StoryModal — comments', () => {
  it("renders the story's comment thread", async () => {
    setup();
    expect(await screen.findByLabelText('Comment on US-1')).toBeInTheDocument();
    expect(api.getScrumComments).toHaveBeenCalledWith('stories', 's1');
  });

  it('gives staff no Delete story and no sprint select, but the comment thread', async () => {
    setup({ sprint_id: null }, { canWrite: false });
    expect(await screen.findByLabelText('Comment on US-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete story' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Sprint' })).toBeNull();
  });
});

describe('StoryModal — task rows (Board 1, Board 6)', () => {
  it("shows each task's status as text, with no way to move it", () => {
    setup({ tasks: [makeTask({ id: 'a', key: 'T-1', status: 'todo' })] });
    expect(screen.queryByRole('combobox', { name: /Status of/ })).toBeNull();
    expect(screen.getByText('TODO')).toBeInTheDocument();
  });

  it('disables Add task at the points cap and says why', () => {
    const tasks = [makeTask({ id: 'a', points: 3 }), makeTask({ id: 'b', points: 2 })];
    setup({ points: 5, tasks });
    const add = screen.getByRole('button', { name: /add task/i });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription("All 5 points are assigned. Raise the story's points to add a task.");

    cleanup();
    setup({ points: 8, tasks });                       // 3 points left
    expect(screen.getByRole('button', { name: /add task/i })).toBeEnabled();
  });

  it('never caps a story without points', () => {
    setup({ points: null, tasks: [makeTask({ id: 'a', points: 3 })] });
    expect(screen.getByRole('button', { name: /add task/i })).toBeEnabled();
    expect(screen.queryByText(/points are assigned/)).toBeNull();
  });
});

describe('StoryModal — delete (backlog only)', () => {
  it('offers Delete story to a backlog story only', () => {
    setup({ sprint_id: null });
    expect(screen.getByRole('button', { name: 'Delete story' })).toBeInTheDocument();
    cleanup();
    setup({ sprint_id: 'sp1' });
    expect(screen.queryByRole('button', { name: 'Delete story' })).toBeNull();
    cleanup();
    setup({ sprint_id: 'sp1', archived_at: '2026-09-01T00:00:00Z' });   // legacy archived: backlog
    expect(screen.getByRole('button', { name: 'Delete story' })).toBeInTheDocument();
  });

  it('confirms before deleting, then calls onDeleteStory', async () => {
    const p = setup({
      key: 'US-6', sprint_id: null, tasks: [makeTask({ id: 'a' }), makeTask({ id: 'b' })],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Delete story' }));

    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent(
      "Delete US-6 and its 2 tasks? Their comments and history go too. This can't be undone.",
    );
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(p.onDeleteStory).not.toHaveBeenCalled();

    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete story' }));
    expect(p.onDeleteStory).toHaveBeenCalledTimes(1);
  });

  it('words the confirm for a story with no tasks, and with one', async () => {
    setup({ key: 'US-6', sprint_id: null, tasks: [] });
    await userEvent.click(screen.getByRole('button', { name: 'Delete story' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      "Delete US-6? Its comments go too. This can't be undone.",
    );
    cleanup();
    setup({ key: 'US-6', sprint_id: null, tasks: [makeTask({ id: 'a' })] });
    await userEvent.click(screen.getByRole('button', { name: 'Delete story' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      "Delete US-6 and its 1 task? Their comments and history go too. This can't be undone.",
    );
  });

  it('stays enabled while deleting, with aria-busy, and ignores a second click', async () => {
    const p = setup({ sprint_id: null }, { deleting: true });
    await userEvent.click(screen.getByRole('button', { name: 'Delete story' }));
    const busy = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Deleting…' });
    expect(busy).toBeEnabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(busy);
    expect(p.onDeleteStory).not.toHaveBeenCalled();
  });
});

describe('StoryModal — sprint select (Backlog 2)', () => {
  const sprints = [
    { id: 'sp1', name: 'Sprint 1', starts_at: '2026-08-10', ends_at: '2026-08-23', status: 'completed' as const },
    { id: 'sp2', name: 'Sprint 2', starts_at: '2026-08-24', ends_at: '2026-09-06', status: 'active' as const },
  ];

  it('shows "Move to a sprint…" and no Backlog option for a backlog story', async () => {
    const p = setup({ sprint_id: null }, { sprints });
    const select = screen.getByRole('combobox', { name: 'Sprint' });
    expect(select).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Move to a sprint…' })).toBeDisabled();
    expect(screen.queryByRole('option', { name: 'Backlog' })).toBeNull();

    await userEvent.selectOptions(select, 'sp2');
    expect(p.onUpdateStory).toHaveBeenCalledWith({ sprint_id: 'sp2' });
  });

  it('moves a legacy archived story into the sprint it still names', async () => {
    const p = setup({ sprint_id: 'sp1', archived_at: '2026-09-01T00:00:00Z' }, { sprints });
    const select = screen.getByRole('combobox', { name: 'Sprint' });
    expect(select).toHaveValue('');                    // in the backlog, not in Sprint 1

    await userEvent.selectOptions(select, 'sp1');
    expect(p.onUpdateStory).toHaveBeenCalledWith({ sprint_id: 'sp1' });
  });

  it('offers Backlog to a sprint story', async () => {
    const p = setup({ sprint_id: 'sp2' }, { sprints });
    const select = screen.getByRole('combobox', { name: 'Sprint' });
    expect(select).toHaveValue('sp2');
    expect(screen.queryByRole('option', { name: 'Move to a sprint…' })).toBeNull();

    await userEvent.selectOptions(select, 'Backlog');
    expect(p.onUpdateStory).toHaveBeenCalledWith({ sprint_id: null });
  });

  it('labels a completed sprint', () => {
    setup({ sprint_id: 'sp2' }, { sprints });
    expect(screen.getByRole('option', { name: 'Sprint 1 (completed)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sprint 2' })).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiTaskRef } from '@/lib/api';
import TaskEditorModal from '../components/TaskEditorModal';
import { remainingStoryPoints } from '../utils/rollups';
import { makeMembers, makeRef, makeSprint, makeStory, makeTask } from './fixtures';

// An existing task's editor renders its comment thread, which loads on mount.
vi.mock('@/lib/api', () => ({
  api: { getScrumComments: vi.fn(), createScrumComment: vi.fn() },
}));
const { api } = await import('@/lib/api');

beforeEach(() => {
  vi.mocked(api.getScrumComments).mockReset().mockResolvedValue({ comments: [] });
  vi.mocked(api.createScrumComment).mockReset();
});

const story = (over = {}) => makeStory({
  key: 'US-1', points: 8,
  tasks: [makeTask({ id: 'a', points: 3 }), makeTask({ id: 'b', points: 2 })],
  ...over,
});

const props = (storyOver = {}) => ({
  story: story(storyOver),
  members: makeMembers(),
  scale: 'fibonacci' as const,
  sprints: [
    makeSprint({ id: 'sp1', name: 'Sprint 1', status: 'completed' }),
    makeSprint({ id: 'sp2', name: 'Sprint 2', status: 'active' }),
  ],
  taskIndex: [] as ApiTaskRef[],
  onOpenRef: vi.fn(),
  onClose: vi.fn(),
  onCreate: vi.fn(),
});

describe('remainingStoryPoints', () => {
  it('subtracts assigned child points from the story estimate', () => {
    expect(remainingStoryPoints(story())).toBe(3);           // 8 - (3+2)
  });
  it('floors at zero when children exceed the estimate', () => {
    expect(remainingStoryPoints(story({ points: 3 }))).toBe(0);
  });
  it('is null when the story carries no estimate', () => {
    expect(remainingStoryPoints(story({ points: null }))).toBeNull();
  });
  it('treats unpointed children as zero', () => {
    const s = story({ points: 5, tasks: [makeTask({ points: null })] });
    expect(remainingStoryPoints(s)).toBe(5);
  });
});

describe('TaskEditorModal', () => {
  it('names its parent story so the context is never ambiguous', () => {
    render(<TaskEditorModal {...props()} />);
    expect(screen.getByRole('dialog', { name: /new task in US-1/i })).toBeInTheDocument();
  });

  it('picks labels from the menu and shows the chosen ones as removable badges', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Wire the filters');

    await userEvent.click(screen.getByRole('button', { name: 'Add label' }));
    const menu = screen.getByRole('menu', { name: 'Labels' });
    expect(within(menu).getAllByRole('menuitemcheckbox')).toHaveLength(10);
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'frontend' }));
    await userEvent.click(within(menu).getByRole('menuitemcheckbox', { name: 'ui/ux' }));
    expect(within(menu).getByRole('menuitemcheckbox', { name: 'frontend' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Remove tag frontend' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(p.onCreate).toHaveBeenCalledWith({
      title: 'Wire the filters', tags: ['frontend', 'ui/ux'],
    });
  });

  it('closes the label menu on Escape without closing the editor', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add label' }));
    expect(screen.getByRole('menu', { name: 'Labels' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Labels' })).toBeNull();
    expect(p.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add label' })).toHaveFocus();
  });

  it('drops a label with its × and sends no empty tags key', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    await userEvent.type(screen.getByLabelText('Title'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Add label' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'bug' }));
    await userEvent.keyboard('{Escape}');

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag bug' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(p.onCreate).toHaveBeenCalledWith({ title: 'x' });
  });

  it('says how many points the story has left', () => {
    render(<TaskEditorModal {...props()} />);
    expect(screen.getByText('3 of 8 pts available in US-1')).toBeInTheDocument();
  });

  it('says so plainly when the story is fully assigned', () => {
    render(<TaskEditorModal {...props({ points: 5 })} />);
    expect(screen.getByText(/fully assigned — raise the story to add more/)).toBeInTheDocument();
  });

  it('stays quiet when the story has no estimate', () => {
    render(<TaskEditorModal {...props({ points: null })} />);
    expect(screen.queryByText(/unassigned in/)).not.toBeInTheDocument();
  });

  it('caps points at what the story has left (maintainer 2026-08-29)', () => {
    render(<TaskEditorModal {...props()} />);          // 3 of 8 left
    expect(screen.getByRole('radio', { name: '3' })).toBeEnabled();
    const five = screen.getByRole('radio', { name: '5' });
    expect(five).toBeDisabled();
    expect(five).toHaveAttribute('title', expect.stringContaining("raise the story's points"));
  });

  it('lets an edited task keep its own points when re-pointing', () => {
    // GT-a already holds 3 of the 8; editing it should offer up to 3 + the 3 free = 6,
    // so 5 is reachable even though a *new* task would be capped at 3.
    const p = props();
    const own = p.story.tasks[0];
    render(<TaskEditorModal {...p} task={own} />);
    expect(screen.getByRole('radio', { name: '5' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: '8' })).toBeDisabled();
  });

  it('edits an existing task and sends the full field set', async () => {
    const p = props();
    const own = { ...p.story.tasks[0], estimate_hours: 2 };
    const onSave = vi.fn();
    render(<TaskEditorModal {...p} task={own} onSave={onSave} />);

    expect(screen.getByRole('dialog', { name: /edit/i })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Renamed task');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));

    // Full set, so clearing a field actually clears it server-side; untouched hours go back as they were.
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renamed task', estimate_hours: 2 }));
  });

  it('clears fields with explicit nulls, so the server clears them too', async () => {
    const p = props();
    const own = makeTask({
      id: 'a', points: 3, description_md: 'Old notes', estimate_hours: 2, assignee_id: 'u1',
      pr_url: 'https://github.com/o/r/pull/1',
    });
    const onSave = vi.fn();
    render(<TaskEditorModal {...p} task={own} onSave={onSave} />);

    await userEvent.clear(screen.getByLabelText('Description'));
    await userEvent.clear(screen.getByLabelText('Time estimate'));
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), '');
    await userEvent.clear(screen.getByLabelText('Pull request'));
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));

    // `undefined` would vanish from the JSON body and the old values would stay.
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      description_md: null, estimate_hours: null, assignee_id: null, pr_url: null,
    }));
  });

  it('links a pull request from an existing task', async () => {
    const p = props();
    const onSave = vi.fn();
    render(<TaskEditorModal {...p} task={p.story.tasks[0]} onSave={onSave} />);

    await userEvent.type(screen.getByLabelText('Pull request'), 'https://github.com/ucsc/app/pull/42');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      pr_url: 'https://github.com/ucsc/app/pull/42',
    }));
  });

  it('refuses a link that is not a pull request, and says why', async () => {
    const p = props();
    render(<TaskEditorModal {...p} task={p.story.tasks[0]} onSave={vi.fn()} />);

    await userEvent.type(screen.getByLabelText('Pull request'), 'https://github.com/ucsc/app');
    expect(screen.getByLabelText('Pull request')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Paste a GitHub pull request link/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save task' })).toBeDisabled();
  });

  it.each(['16', '0', '2.5'])('refuses hours outside 1 to 15 (%s), and says why', async (typed) => {
    const p = props();
    const onSave = vi.fn();
    render(<TaskEditorModal {...p} task={p.story.tasks[0]} onSave={onSave} />);

    const box = screen.getByLabelText('Time estimate');
    await userEvent.type(box, typed);
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter whole hours, 1 to 15.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save task' })).toBeDisabled();
    // Enter in the title submits as well: the same guard refuses it.
    await userEvent.type(screen.getByLabelText('Title'), '{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('explains the hours box', () => {
    render(<TaskEditorModal {...props()} />);
    const box = screen.getByLabelText('Time estimate');
    expect(screen.getByText('Whole hours, up to 15.')).toBeInTheDocument();
    expect(box).toHaveAccessibleDescription('Whole hours, up to 15.');
    expect(box).toHaveAttribute('type', 'number');
    expect(box).toHaveAttribute('min', '1');
    expect(box).toHaveAttribute('max', '15');
    expect(box).toHaveAttribute('step', '1');
  });

  it('does not clear the hours when the browser cannot read the box (Firefox and Safari read "4h" as empty)', () => {
    const p = props();
    const onSave = vi.fn();
    render(<TaskEditorModal {...p} task={{ ...p.story.tasks[0], estimate_hours: 4 }} onSave={onSave} />);

    const box = screen.getByLabelText('Time estimate');
    // jsdom never reports badInput: stand in for the browser that was handed "4h". A keystroke is an
    // input event (React's onChange listens to it too).
    Object.defineProperty(box, 'validity', { configurable: true, value: { badInput: true } });
    fireEvent.input(box, { target: { value: '' } });

    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Enter whole hours, 1 to 15.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save task' })).toBeDisabled();
  });

  it('recovers once the unreadable text is deleted, although the box’s value never changed', () => {
    const p = props();
    render(<TaskEditorModal {...p} task={{ ...p.story.tasks[0], estimate_hours: 4 }} onSave={vi.fn()} />);

    const box = screen.getByLabelText('Time estimate');
    // "4h" typed: the browser reports an empty value and badInput; React fires onChange ('4' → '').
    Object.defineProperty(box, 'validity', { configurable: true, value: { badInput: true } });
    fireEvent.input(box, { target: { value: '' } });
    expect(box).toHaveAttribute('aria-invalid', 'true');

    // Select all, delete: the value is still '', so no onChange — only an input event.
    Object.defineProperty(box, 'validity', { configurable: true, value: { badInput: false } });
    fireEvent.input(box, { target: { value: '' } });

    expect(box).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Whole hours, up to 15.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save task' })).toBeEnabled();
  });

  it('asks for a pull request only once the task exists', () => {
    render(<TaskEditorModal {...props()} />);
    expect(screen.queryByLabelText('Pull request')).toBeNull();
  });

  it('offers a way back to the parent story', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /US-1/ }));
    expect(p.onClose).toHaveBeenCalled();
  });

  it('sends estimate and assignee when given', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    await userEvent.type(screen.getByLabelText('Title'), 'Full task');
    await userEvent.type(screen.getByLabelText('Time estimate'), '4');
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'u1');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(p.onCreate).toHaveBeenCalledWith({
      title: 'Full task', estimate_hours: 4, assignee_id: 'u1',
    });
  });

  it('shows the comment thread for an existing task only', async () => {
    const p = props();
    const { unmount } = render(<TaskEditorModal {...p} task={makeTask({ id: 'a', key: 'T-1' })} onSave={vi.fn()} />);
    expect(await screen.findByLabelText('Comment on T-1')).toBeInTheDocument();
    expect(api.getScrumComments).toHaveBeenCalledWith('tasks', 'a');
    unmount();

    vi.mocked(api.getScrumComments).mockClear();
    render(<TaskEditorModal {...p} />);               // create mode: nothing to comment on yet
    expect(screen.queryByRole('textbox', { name: /comment on/i })).toBeNull();
    expect(api.getScrumComments).not.toHaveBeenCalled();
  });

  it('keeps unsaved edits when the thread posts and the parent re-renders', async () => {
    const comment = {
      id: 'c1', author_id: 'u1', author_name: 'Tony Wu', body_md: 'Looks good',
      created_at: new Date().toISOString(),
    };
    vi.mocked(api.createScrumComment).mockResolvedValue(comment);
    const p = props();
    const own = makeTask({ id: 'a', key: 'T-1', title: 'Build form' });
    const onCommentPosted = vi.fn();
    const { rerender } = render(
      <TaskEditorModal {...p} task={own} onSave={vi.fn()} onCommentPosted={onCommentPosted} />,
    );

    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Build the signup form');
    await userEvent.type(await screen.findByLabelText('Comment on T-1'), 'Looks good');
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(onCommentPosted).toHaveBeenCalled());

    // The page refetches the board after a post: the same task comes back as a new object.
    rerender(
      <TaskEditorModal
        {...p} task={{ ...own, comment_count: own.comment_count + 1 }} onSave={vi.fn()} onClose={vi.fn()}
        onCommentPosted={onCommentPosted}
      />,
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Build the signup form');
  });

  it('leaves focus in the composer when the page re-renders after a post', async () => {
    const comment = {
      id: 'c1', author_id: 'u1', author_name: 'Tony Wu', body_md: 'First',
      created_at: new Date().toISOString(),
    };
    vi.mocked(api.createScrumComment).mockResolvedValue(comment);
    const p = props();
    const own = makeTask({ id: 'a', key: 'T-1' });
    const { rerender } = render(<TaskEditorModal {...p} task={own} onSave={vi.fn()} />);

    const box = await screen.findByLabelText('Comment on T-1');
    await userEvent.type(box, 'First');
    await userEvent.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(box).toHaveValue(''));

    // The board page hands the editor a new onClose on every render, a refetch included.
    rerender(<TaskEditorModal {...p} task={{ ...own, comment_count: 1 }} onSave={vi.fn()} onClose={vi.fn()} />);
    expect(box).toHaveFocus();
  });

  it('moves the task from its status select right away', async () => {
    const onMove = vi.fn();
    const onSave = vi.fn();
    render(
      <TaskEditorModal
        {...props()} task={makeTask({ id: 'a', key: 'T-1', status: 'todo' })}
        onSave={onSave} onMove={onMove}
      />,
    );
    const status = screen.getByLabelText('Status');
    expect(status).toHaveValue('todo');
    expect(status).toHaveAccessibleDescription('Applies right away.');

    await userEvent.selectOptions(status, 'done');
    expect(onMove).toHaveBeenCalledWith('done');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('has no status select when the page cannot move the task', () => {
    render(<TaskEditorModal {...props()} task={makeTask({ id: 'a', key: 'T-1' })} onSave={vi.fn()} />);
    expect(screen.queryByLabelText('Status')).toBeNull();
  });

  it('stays enabled while saving, with aria-busy, and ignores a second click', async () => {
    const p = props();
    const onSave = vi.fn();
    render(<TaskEditorModal {...p} task={p.story.tasks[0]} onSave={onSave} saving />);

    const busy = screen.getByRole('button', { name: 'Saving…' });
    expect(busy).toBeEnabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(busy);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires a title and closes on Escape', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(p.onClose).toHaveBeenCalled();
  });
});

describe('TaskEditorModal dependencies', () => {
  // The project's tasks as the board's task_index lists them: Sprint 1 is completed, Sprint 2 is
  // the edited task's, GT-4 and GT-6 are in the backlog.
  const REF = {
    a: makeRef({ id: 'a', key: 'GT-1', title: 'Build form', sprint_id: 'sp2' }),
    b: makeRef({ id: 'b', key: 'GT-2', title: 'Design API', status: 'in_progress', sprint_id: 'sp2' }),
    c: makeRef({ id: 'c', key: 'GT-3', title: 'Old spike', status: 'done', sprint_id: 'sp1' }),
    d: makeRef({ id: 'd', key: 'GT-4', title: 'Write docs', sprint_id: null }),
    e: makeRef({ id: 'e', key: 'GT-5', title: 'Add tests', sprint_id: 'sp2' }),
    f: makeRef({ id: 'f', key: 'GT-6', title: 'Polish', sprint_id: null }),
  };
  const INDEX = [REF.a, REF.b, REF.c, REF.d, REF.e, REF.f];

  /** GT-1, in To do, depends on GT-2 (under way, so GT-1 is blocked); GT-4 depends on GT-1. */
  const depTask = (over = {}) => makeTask({
    id: 'a', key: 'GT-1', title: 'Build form', depends_on: [REF.b], blocks: [REF.d], ...over,
  });

  /** The editor on GT-1 for a team member, unless `over` says otherwise. */
  const renderDeps = (over: Partial<ComponentProps<typeof TaskEditorModal>> = {}) => {
    const p = {
      ...props(), taskIndex: INDEX, task: depTask(), onSave: vi.fn(),
      onAddDependency: vi.fn(), onRemoveDependency: vi.fn(), ...over,
    };
    render(<TaskEditorModal {...p} />);
    return p;
  };
  const lists = () => within(screen.getByRole('region', { name: 'Depends on' })).getAllByRole('list');

  it('lists what the task depends on, with status, and opens one from its key', async () => {
    const p = renderDeps();
    const [row] = within(lists()[0]).getAllByRole('listitem');
    expect(row).toHaveTextContent('GT-2');
    expect(row).toHaveTextContent('Design API');
    expect(row).toHaveTextContent('In Progress');

    await userEvent.click(within(row).getByRole('button', { name: 'GT-2' }));
    expect(p.onOpenRef).toHaveBeenCalledWith(REF.b);
  });

  it('says so when the task depends on nothing', () => {
    renderDeps({ task: depTask({ depends_on: [] }) });
    expect(screen.getByText('No dependencies.')).toBeInTheDocument();
  });

  it('removes a dependency', async () => {
    const p = renderDeps();
    await userEvent.click(screen.getByRole('button', { name: 'Remove dependency on GT-2' }));
    expect(p.onRemoveDependency).toHaveBeenCalledWith('b');
  });

  it('offers the project’s other tasks grouped by sprint and backlog', () => {
    renderDeps();
    const picker = screen.getByLabelText('Add a dependency');
    expect([...picker.querySelectorAll('optgroup')].map((g) => g.label))
      .toEqual(['Sprint 1 (completed)', 'Sprint 2', 'Backlog']);
    // Not GT-1 itself, not GT-2 (already a dependency), not GT-4 (it depends on GT-1).
    expect(within(picker).getAllByRole('option').map((o) => o.textContent))
      .toEqual(['Add a dependency…', 'GT-3 · Old spike', 'GT-5 · Add tests', 'GT-6 · Polish']);
  });

  it('leaves out a group with nothing to offer', () => {
    renderDeps({ taskIndex: [REF.a, REF.b, REF.d, REF.e] });
    const picker = screen.getByLabelText('Add a dependency');
    expect([...picker.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Sprint 2']);
  });

  it('adds the picked dependency and resets the picker', async () => {
    const p = renderDeps();
    const add = screen.getByRole('button', { name: 'Add' });
    expect(add).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Add a dependency'), 'e');
    await userEvent.click(add);
    expect(p.onAddDependency).toHaveBeenCalledWith('e');
    expect(screen.getByLabelText('Add a dependency')).toHaveValue('');
    expect(add).toBeDisabled();
  });

  it('shows the lists read-only without the write callbacks', async () => {
    const p = renderDeps({ onAddDependency: undefined, onRemoveDependency: undefined });
    expect(screen.queryByLabelText('Add a dependency')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remove dependency/ })).toBeNull();
    // Staff still follow a key to the task it names.
    await userEvent.click(screen.getByRole('button', { name: 'GT-2' }));
    expect(p.onOpenRef).toHaveBeenCalledWith(REF.b);
  });

  it('lists what the task blocks', async () => {
    const p = renderDeps();
    const section = screen.getByRole('region', { name: 'Depends on' });
    expect(within(section).getByRole('heading', { name: 'Blocks' })).toBeInTheDocument();
    const [row] = within(lists()[1]).getAllByRole('listitem');
    expect(row).toHaveTextContent('Write docs');
    expect(within(row).queryByRole('button', { name: /remove/i })).toBeNull();

    await userEvent.click(within(row).getByRole('button', { name: 'GT-4' }));
    expect(p.onOpenRef).toHaveBeenCalledWith(REF.d);
  });

  it('disables In progress and Done while blocked, and says why', () => {
    renderDeps({ onMove: vi.fn() });
    const status = screen.getByLabelText('Status');
    expect(within(status).getByRole('option', { name: 'TODO' })).toBeEnabled();
    expect(within(status).getByRole('option', { name: 'In Progress' })).toBeDisabled();
    expect(within(status).getByRole('option', { name: 'Done' })).toBeDisabled();
    expect(status).toHaveAccessibleDescription('GT-1 is blocked by GT-2');
  });

  it('has no dependencies section for a new task', () => {
    render(<TaskEditorModal {...props()} taskIndex={INDEX} />);
    expect(screen.queryByRole('region', { name: 'Depends on' })).toBeNull();
  });

  it('shows no dependency UI for a task from an older backend', () => {
    renderDeps({ task: { ...depTask(), depends_on: undefined, blocks: undefined }, taskIndex: [] });
    expect(screen.queryByRole('region', { name: 'Depends on' })).toBeNull();
    expect(screen.queryByLabelText('Add a dependency')).toBeNull();
  });
});

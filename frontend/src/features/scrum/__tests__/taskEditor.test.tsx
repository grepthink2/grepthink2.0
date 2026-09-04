import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskEditorModal from '../components/TaskEditorModal';
import { remainingStoryPoints } from '../utils/rollups';
import { makeMembers, makeStory, makeTask } from './fixtures';

const story = (over = {}) => makeStory({
  key: 'US-1', points: 8,
  tasks: [makeTask({ id: 'a', points: 3 }), makeTask({ id: 'b', points: 2 })],
  ...over,
});

const props = (storyOver = {}) => ({
  story: story(storyOver),
  members: makeMembers(),
  scale: 'fibonacci' as const,
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

  it('offers all ten tags and sends only the toggled ones', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    const tags = screen.getAllByRole('button', { pressed: false });
    expect(tags.length).toBeGreaterThanOrEqual(10);

    await userEvent.type(screen.getByLabelText('Title'), 'Wire the filters');
    await userEvent.click(screen.getByRole('button', { name: /frontend/ }));
    await userEvent.click(screen.getByRole('button', { name: 'ui/ux' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(p.onCreate).toHaveBeenCalledWith({
      title: 'Wire the filters', tags: ['frontend', 'ui/ux'],
    });
  });

  it('toggles a tag back off', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    await userEvent.type(screen.getByLabelText('Title'), 'x');
    const bug = screen.getByRole('button', { name: 'bug' });
    await userEvent.click(bug);
    expect(bug).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(bug);
    expect(bug).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));
    expect(p.onCreate).toHaveBeenCalledWith({ title: 'x' });   // no empty tags key
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
    const own = p.story.tasks[0];
    const onSave = vi.fn();
    render(<TaskEditorModal {...p} task={own} onSave={onSave} />);

    expect(screen.getByRole('dialog', { name: /edit/i })).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Renamed task');
    await userEvent.click(screen.getByRole('button', { name: 'Save task' }));

    // Full set, so clearing a field actually clears it server-side.
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Renamed task' }));
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
    await userEvent.type(screen.getByLabelText('Time estimate'), '4h');
    await userEvent.selectOptions(screen.getByLabelText('Assignee'), 'u1');
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }));

    expect(p.onCreate).toHaveBeenCalledWith({
      title: 'Full task', time_estimate: '4h', assignee_id: 'u1',
    });
  });

  it('requires a title and closes on Escape', async () => {
    const p = props();
    render(<TaskEditorModal {...p} />);
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(p.onClose).toHaveBeenCalled();
  });
});

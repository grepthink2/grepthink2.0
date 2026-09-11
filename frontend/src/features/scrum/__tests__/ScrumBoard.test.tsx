import { describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScrumBoard from '../components/ScrumBoard';
import { buildMemberMap } from '../scrumTypes';
import { makeMembers, makeTask } from './fixtures';

const members = buildMemberMap(makeMembers());
const storyKeys = { s1: 'US-1' };

const tasks = [
  makeTask({ id: 'a', key: 'T-1', title: 'Todo task', status: 'todo', points: 3 }),
  makeTask({ id: 'b', key: 'T-2', title: 'Doing task', status: 'in_progress', points: 5 }),
  makeTask({ id: 'c', key: 'T-3', title: 'Done task', status: 'done', points: 2 }),
  makeTask({ id: 'd', key: 'T-4', title: 'Another todo', status: 'todo', points: null }),
];

/** Minimal DataTransfer stand-in — jsdom does not implement drag payloads. */
function dataTransfer() {
  const store: Record<string, string> = {};
  return {
    setData: (k: string, v: string) => { store[k] = v; },
    getData: (k: string) => store[k] ?? '',
    effectAllowed: '',
  };
}

const col = (label: string) => screen.getByRole('region', { name: `${label} column` });

const renderBoard = (over: Partial<React.ComponentProps<typeof ScrumBoard>> = {}) =>
  render(<ScrumBoard tasks={tasks} members={members} storyKeys={storyKeys} {...over} />);

describe('ScrumBoard layout', () => {
  it('renders the three fixed columns with counts and point totals', () => {
    renderBoard();
    expect(within(col('TODO')).getByText('2')).toBeInTheDocument();
    expect(within(col('TODO')).getByText('3 pts')).toBeInTheDocument();      // null points ignored
    expect(within(col('In Progress')).getByText('5 pts')).toBeInTheDocument();
    expect(within(col('Done')).getByText('2 pts')).toBeInTheDocument();
  });

  it('places each task in its status column with the parent story chip', () => {
    renderBoard();
    expect(within(col('TODO')).getByText('Todo task')).toBeInTheDocument();
    expect(within(col('Done')).getByText('Done task')).toBeInTheDocument();
    expect(within(col('TODO')).getAllByText('US-1').length).toBe(2);
  });

  it('shows a drop target in an empty column', () => {
    render(<ScrumBoard tasks={[]} members={members} storyKeys={storyKeys} />);
    expect(within(col('TODO')).getByText('Drop tasks here')).toBeInTheDocument();
  });
});

describe('ScrumBoard drag and drop', () => {
  it('moves a card to the dropped column', () => {
    const onMove = vi.fn();
    const { container } = renderBoard({ onMove });
    const card = container.querySelector('.gt-board__drag')!;
    const dt = dataTransfer();

    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragOver(col('Done'), { dataTransfer: dt });
    fireEvent.drop(col('Done'), { dataTransfer: dt });

    expect(onMove).toHaveBeenCalledWith('a', 'done');
  });

  it('ignores a drop back onto the same column', () => {
    const onMove = vi.fn();
    const { container } = renderBoard({ onMove });
    const dt = dataTransfer();

    fireEvent.dragStart(container.querySelector('.gt-board__drag')!, { dataTransfer: dt });
    fireEvent.drop(col('TODO'), { dataTransfer: dt });

    expect(onMove).not.toHaveBeenCalled();
  });

  it('highlights the hovered column and ghosts the dragged card', () => {
    const { container } = renderBoard({ onMove: vi.fn() });
    const card = container.querySelector('.gt-board__drag')!;
    const dt = dataTransfer();

    fireEvent.dragStart(card, { dataTransfer: dt });
    expect(card).toHaveClass('gt-board__drag--ghost');
    fireEvent.dragOver(col('Done'), { dataTransfer: dt });
    expect(col('Done')).toHaveClass('gt-board__col--over');
  });

  it('clears the highlight when the drag ends outside any column', () => {
    const { container } = renderBoard({ onMove: vi.fn() });
    const card = container.querySelector('.gt-board__drag')!;
    const dt = dataTransfer();

    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragOver(col('Done'), { dataTransfer: dt });
    expect(col('Done')).toHaveClass('gt-board__col--over');

    // Released over nothing: `dragend` on the source is the only signal we get.
    fireEvent.dragEnd(card);
    expect(col('Done')).not.toHaveClass('gt-board__col--over');
    expect(card).not.toHaveClass('gt-board__drag--ghost');
  });

  it('keeps the highlight while moving between a column and its children', () => {
    const { container } = renderBoard({ onMove: vi.fn() });
    const dt = dataTransfer();
    fireEvent.dragStart(container.querySelector('.gt-board__drag')!, { dataTransfer: dt });
    fireEvent.dragOver(col('Done'), { dataTransfer: dt });

    // jsdom drops `relatedTarget` on drag events (verified: it arrives undefined
    // via both the fireEvent init and createEvent), so define it explicitly —
    // otherwise every internal move looks like leaving the column.
    const inner = within(col('Done')).getByText('Done task');
    const leave = createEvent.dragLeave(col('Done'));
    Object.defineProperty(leave, 'relatedTarget', { value: inner });
    fireEvent(col('Done'), leave);

    expect(col('Done')).toHaveClass('gt-board__col--over');
  });

  it('drops the highlight when the pointer genuinely leaves the column', () => {
    const { container } = renderBoard({ onMove: vi.fn() });
    const dt = dataTransfer();
    fireEvent.dragStart(container.querySelector('.gt-board__drag')!, { dataTransfer: dt });
    fireEvent.dragOver(col('Done'), { dataTransfer: dt });

    const outside = within(col('TODO')).getByText('Todo task');
    const leave = createEvent.dragLeave(col('Done'));
    Object.defineProperty(leave, 'relatedTarget', { value: outside });
    fireEvent(col('Done'), leave);

    expect(col('Done')).not.toHaveClass('gt-board__col--over');
  });
});

describe('ScrumBoard read-only (staff)', () => {
  it('makes cards undraggable and never reports a move', () => {
    const onMove = vi.fn();
    const { container } = renderBoard({ canWrite: false, onMove });
    const card = container.querySelector('.gt-board__drag')!;
    expect(card).not.toHaveAttribute('draggable', 'true');

    fireEvent.drop(col('Done'), { dataTransfer: dataTransfer() });
    expect(onMove).not.toHaveBeenCalled();
  });

  it('explains an empty column instead of inviting a drop', () => {
    render(<ScrumBoard tasks={[]} members={members} storyKeys={storyKeys} canWrite={false} />);
    expect(within(col('TODO')).getByText('Nothing in TODO')).toBeInTheDocument();
    expect(screen.queryByText('Drop tasks here')).not.toBeInTheDocument();
  });
});

describe('ScrumBoard task detail', () => {
  it('opens a task by click and by keyboard', async () => {
    const onOpenTask = vi.fn();
    renderBoard({ onOpenTask });

    await userEvent.click(screen.getByText('Todo task'));
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));

    onOpenTask.mockClear();
    const doneCard = within(col('Done')).getByRole('button');
    doneCard.focus();
    await userEvent.keyboard('{Enter}');
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });
});

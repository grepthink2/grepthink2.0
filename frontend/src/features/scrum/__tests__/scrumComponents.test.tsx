import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiScrumTask } from '@/lib/api';
import BacklogRow from '../components/BacklogRow';
import TagBadge from '../components/TagBadge';
import StoryCard from '../components/StoryCard';
import TaskCard from '../components/TaskCard';
import BurnupChart from '../components/BurnupChart';
import { seriesPoints } from '../utils/burnupGeometry';
import { PointPicker } from '../components/ScalePicker';
import { PointsChip, UserPair } from '../components/Chips';
import { buildMemberMap, personOf, UNKNOWN_PERSON } from '../scrumTypes';
import { cssRules } from '@/test/cssRules';
import { makeMembers, makeRef, makeStory, makeTask } from './fixtures';
// The chips' look lives in the scrum layer, which the board page loads.
import '../scrum.scss';

const members = buildMemberMap(makeMembers());

describe('PointsChip', () => {
  it('shows a task with no points as "– pts", named for screen readers', () => {
    render(<PointsChip missing size="sm" />);
    const chip = screen.getByRole('img', { name: 'No points yet' });
    expect(chip).toHaveAttribute('aria-label', 'No points yet');
    // No title: Chromium exposes one as a description, which would repeat the name.
    expect(chip).not.toHaveAttribute('title');
    // An en dash (U+2013), not a hyphen.
    expect(chip.textContent).toBe(`${String.fromCharCode(0x2013)} pts`);
    expect(chip).toHaveClass('gt-points', 'gt-points--sm', 'gt-points--missing');
  });

  it('draws the missing chip with the tokens only: a dashed muted border and no fill', () => {
    render(<PointsChip missing />);
    const [missing] = cssRules('.gt-points--missing');
    expect(missing.getPropertyValue('border')).toBe('1px dashed var(--gt-border-subtle)');
    expect(missing.getPropertyValue('background')).toBe('transparent');
    expect(missing.getPropertyValue('color')).toBe('var(--gt-text-tertiary)');
    // The rule wins over .gt-points, whose green text and fill it replaces (jsdom resolves the colour,
    // not a background given with var()).
    expect(getComputedStyle(screen.getByRole('img')).color).toBe('var(--gt-text-tertiary)');
  });

  it('shows the points of a task that has them, with no accessible-name override', () => {
    render(<PointsChip points={5} size="sm" />);
    const chip = screen.getByText('5');
    expect(chip).not.toHaveAttribute('aria-label');
    expect(chip).not.toHaveClass('gt-points--missing');
  });
});

describe('TagBadge', () => {
  it('applies the preset modifier class, slashes stripped', () => {
    const { container } = render(<TagBadge tag="ui/ux" />);
    expect(container.querySelector('.gt-tagbadge--uiux')).not.toBeNull();
  });
  it('only renders the remove button when removable', async () => {
    const onRemove = vi.fn();
    const { rerender } = render(<TagBadge tag="bug" />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<TagBadge tag="bug" onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: /remove tag bug/i }));
    expect(onRemove).toHaveBeenCalledOnce();
  });
});

describe('StoryCard', () => {
  // The story's own estimate_hours is deliberately wrong: the card must sum its tasks instead
  // (an optimistic edit never refreshes the server's sum).
  const story = makeStory({
    key: 'US-3', title: 'Login flow', points: 8, estimate_hours: 99, assignee_id: 'u1',
    tasks: [
      makeTask({ id: 'a', key: 'T-1', points: 3, status: 'done', estimate_hours: 8 }),
      makeTask({ id: 'b', key: 'T-2', points: 5, status: 'todo', estimate_hours: 4 }),
    ],
  });

  it('shows the derived rollup and marks the active filter', () => {
    const { container } = render(<StoryCard story={story} members={members} active />);
    expect(screen.getByText('US-3')).toBeInTheDocument();
    expect(screen.getByText('1/2 tasks · 3/8 pts')).toBeInTheDocument();
    expect(container.querySelector('.gt-story--active')).not.toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it("shows the sum of its tasks' hours, not a stored estimate", () => {
    render(<StoryCard story={story} members={members} />);
    expect(screen.getByText('12h')).toBeInTheDocument();
  });

  it('shows no hours chip when no task has hours', () => {
    const unestimated = {
      ...story,
      tasks: story.tasks.map((t) => ({ ...t, estimate_hours: null })),
    };
    const { container } = render(<StoryCard story={unestimated} members={members} />);
    expect(container.querySelector('.gt-estimate')).toBeNull();
  });

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn();
    render(<StoryCard story={story} members={members} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('TaskCard', () => {
  it('shows its hours', () => {
    render(<TaskCard task={makeTask({ estimate_hours: 4 })} members={members} />);
    expect(screen.getByText('4h')).toBeInTheDocument();
  });

  it('shows the dashed "– pts" chip on a task without points, and the card names it', () => {
    render(<TaskCard task={makeTask({ points: null })} members={members} onOpen={vi.fn()} />);
    expect(screen.getByRole('img', { name: 'No points yet' })).toHaveTextContent('pts');
    // The card is the control: the chip's name is part of what it announces.
    expect(screen.getByRole('button')).toHaveAccessibleName(/No points yet/);
  });

  it('shows the points, not the dashed chip, on a task that has them', () => {
    const { container } = render(<TaskCard task={makeTask({ points: 3 })} members={members} />);
    expect(container.querySelector('.gt-points')).toHaveTextContent('3');
    expect(screen.queryByRole('img', { name: 'No points yet' })).toBeNull();
  });

  it('renders without a chip for a task row from an older backend (no estimate_hours key)', () => {
    const legacy = { ...makeTask(), estimate_hours: undefined } as unknown as ApiScrumTask;
    const { container } = render(<TaskCard task={legacy} members={members} />);
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(container.querySelector('.gt-estimate')).toBeNull();
  });

  it('marks a blocked task, naming its blockers on hover', () => {
    const task = makeTask({
      key: 'GT-15',
      depends_on: [
        makeRef({ id: 'b', key: 'GT-12', status: 'in_progress' }),
        makeRef({ id: 'c', key: 'GT-13', status: 'done' }),
      ],
    });
    render(<TaskCard task={task} members={members} onOpen={vi.fn()} />);
    expect(screen.getByText('Blocked')).toHaveAttribute('title', 'GT-15 is blocked by GT-12');
    // The card is the control: the chip is part of what it announces.
    expect(screen.getByRole('button')).toHaveAccessibleName(/Blocked/);
  });

  it('shows no chip once every dependency is done, or once the task is under way', () => {
    const done = [makeRef({ id: 'b', key: 'GT-12', status: 'done' })];
    const unfinished = [makeRef({ id: 'b', key: 'GT-12', status: 'todo' })];
    const { rerender } = render(<TaskCard task={makeTask({ depends_on: done })} members={members} />);
    expect(screen.queryByText('Blocked')).toBeNull();
    rerender(<TaskCard task={makeTask({ status: 'in_progress', depends_on: unfinished })} members={members} />);
    expect(screen.queryByText('Blocked')).toBeNull();
  });

  it('renders a task from an older backend (no dependency lists) with no chip', () => {
    render(<TaskCard task={{ ...makeTask(), depends_on: undefined, blocks: undefined }} members={members} />);
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.queryByText('Blocked')).toBeNull();
  });
});

describe('BacklogRow', () => {
  it('names the sprint in its move button', async () => {
    const onMoveToSprint = vi.fn();
    render(
      <BacklogRow
        story={makeStory({ key: 'US-1', sprint_id: null })} members={members}
        sprintName="Sprint 2" onMoveToSprint={onMoveToSprint}
      />,
    );
    const move = screen.getByRole('button', { name: 'Move US-1 to Sprint 2' });
    expect(move).toHaveTextContent('Move to Sprint 2');
    await userEvent.click(move);
    expect(onMoveToSprint).toHaveBeenCalledOnce();
  });

  it("shows the sum of its tasks' hours, not a stored estimate", () => {
    const story = makeStory({
      key: 'US-1', sprint_id: null, estimate_hours: 99,
      tasks: [makeTask({ id: 'a', estimate_hours: 3 }), makeTask({ id: 'b', estimate_hours: 2 })],
    });
    render(<BacklogRow story={story} members={members} sprintName="Sprint 2" />);
    expect(screen.getByText('5h')).toBeInTheDocument();
  });

  it('shows no archive date for a legacy archived story', () => {
    const { container } = render(
      <BacklogRow
        story={makeStory({ key: 'US-1', sprint_id: 'sp1', archived_at: '2026-09-01T00:00:00Z' })}
        members={members} sprintName="Sprint 2"
      />,
    );
    expect(container).not.toHaveTextContent(/archived/i);
  });
});

describe('UserPair', () => {
  const tony = { user_id: 'u1', name: 'Tony Wu', image_url: null };
  const qa = { user_id: 'u2', name: 'QA Student', image_url: null };

  it('names both people in design-system tooltips, not the delayed native title', () => {
    const { container } = render(<UserPair reporter={tony} assignee={qa} />);
    const tips = screen.getAllByRole('tooltip').map((t) => t.textContent);
    expect(tips).toEqual(['Reporter: Tony Wu', 'Assignee: QA Student']);
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('keeps the avatars out of the tab order, since cards are the control', () => {
    const { container } = render(<UserPair reporter={tony} assignee={qa} />);
    expect(container.querySelector('[tabindex]')).toBeNull();
  });

  it('draws "?" for a person no member matches, and keeps Unknown in the tooltip', () => {
    const { container } = render(<UserPair reporter={personOf({}, 'gone', UNKNOWN_PERSON)} assignee={qa} />);
    expect(screen.getAllByRole('tooltip')[0]).toHaveTextContent('Reporter: Unknown');
    expect(container.querySelectorAll('.gt-avatar')[0]).toHaveTextContent(/^\?$/);
    expect(container.querySelectorAll('.gt-avatar')[1]).toHaveTextContent('QS');
  });

  it('hides the avatars, which the tooltips name, photo or initials', () => {
    const { container } = render(<UserPair reporter={{ ...tony, image_url: 'https://img.example/tony.png' }} assignee={qa} />);
    expect(screen.queryByRole('img')).toBeNull();
    const [photo, initials] = Array.from(container.querySelectorAll('.gt-avatar'));
    expect(photo).toHaveAttribute('alt', '');
    expect(photo).toHaveAttribute('aria-hidden', 'true');
    expect(initials).toHaveTextContent('QS');
    expect(initials).toHaveAttribute('aria-hidden', 'true');
    expect(initials).toHaveClass('gt-avatar--xs');
  });
});

describe('BurnupChart', () => {
  it('maps values into the 100x100 viewBox, y inverted', () => {
    // 3 steps, max 10 -> x at 0/50/100; y = 100 - v/max*100
    expect(seriesPoints([0, 5, 10], 3, 10)).toBe('0,100 50,50 100,0');
  });
  it('renders the head stat from the series ends', () => {
    render(
      <BurnupChart labels={['M', 'T', 'W']} scope={[10, 10, 18]} completed={[0, 5, 13]} title="Sprint 3 burnup" unit="points" />,
    );
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText(/\/18 pts/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Burnup: 13 of 18 points complete');
  });

  it('names its unit, hours, in the stat and the plot', () => {
    const { container } = render(
      <BurnupChart labels={['M', 'T', 'W']} scope={[20, 20, 24]} completed={[0, 6, 9]} title="Sprint 3 burnup" unit="hours" />,
    );
    expect(container.querySelector('.gt-burnup__stat')).toHaveTextContent(/^9\/24 h$/);
    expect(container).not.toHaveTextContent(/pts|points/);
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Burnup: 9 of 24 hours complete');
  });
});

describe('PointPicker', () => {
  it('offers exactly the active scale values and marks the selection', async () => {
    const onChange = vi.fn();
    render(<PointPicker scale="fibonacci" value={5} onChange={onChange} />);
    const chips = screen.getAllByRole('radio');
    expect(chips.map((c) => c.textContent)).toEqual(['1', '2', '3', '5', '8', '13']);
    expect(screen.getByRole('radio', { name: '5' })).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('radio', { name: '8' }));
    expect(onChange).toHaveBeenCalledWith(8);
  });
});

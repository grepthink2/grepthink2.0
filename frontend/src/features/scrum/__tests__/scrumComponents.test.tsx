import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TagBadge from '../components/TagBadge';
import StoryCard from '../components/StoryCard';
import BurnupChart, { seriesPoints } from '../components/BurnupChart';
import { PointPicker } from '../components/ScalePicker';
import { buildMemberMap } from '../scrumTypes';
import type { ApiScrumStory } from '@/lib/api';

const members = buildMemberMap([
  { user_id: 'u1', name: 'Tony Wu', image_url: null, project_role: 'owner' },
]);

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
  const story: ApiScrumStory = {
    id: 's1', sprint_id: 'sp1', key: 'US-3', title: 'Login flow',
    description_md: null, points: 8, time_estimate: '2d', reporter_id: 'u1',
    assignee_id: 'u1', archived_at: null, comment_count: 0,
    tasks: [
      { id: 'a', story_id: 's1', key: 'T-1', title: 'x', description_md: null, points: 3,
        time_estimate: null, status: 'done', reporter_id: 'u1', assignee_id: null, tags: [],
        pr_url: null, pr_provider: null, pr_state: null, moved_by: null, moved_by_name: null,
        moved_at: null, comment_count: 0 },
      { id: 'b', story_id: 's1', key: 'T-2', title: 'y', description_md: null, points: 5,
        time_estimate: null, status: 'todo', reporter_id: 'u1', assignee_id: null, tags: [],
        pr_url: null, pr_provider: null, pr_state: null, moved_by: null, moved_by_name: null,
        moved_at: null, comment_count: 0 },
    ],
  };

  it('shows the derived rollup and marks the active filter', () => {
    const { container } = render(<StoryCard story={story} members={members} active />);
    expect(screen.getByText('US-3')).toBeInTheDocument();
    expect(screen.getByText('1/2 tasks · 3/8 pts')).toBeInTheDocument();
    expect(container.querySelector('.gt-story--active')).not.toBeNull();
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelect when clicked', async () => {
    const onSelect = vi.fn();
    render(<StoryCard story={story} members={members} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('BurnupChart', () => {
  it('maps values into the 100x100 viewBox, y inverted', () => {
    // 3 steps, max 10 -> x at 0/50/100; y = 100 - v/max*100
    expect(seriesPoints([0, 5, 10], 3, 10)).toBe('0,100 50,50 100,0');
  });
  it('renders the head stat from the series ends', () => {
    render(<BurnupChart labels={['M', 'T', 'W']} scope={[10, 10, 18]} completed={[0, 5, 13]} title="Sprint 3 burnup" />);
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText(/\/18 pts/)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Burnup: 13 of 18 points complete');
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

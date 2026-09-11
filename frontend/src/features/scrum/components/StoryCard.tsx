import { Maximize2 } from 'lucide-react';
import type { ApiScrumStory } from '@/lib/api';
import type { MemberMap } from '../scrumTypes';
import { personOf, UNKNOWN_PERSON } from '../scrumTypes';
import { storyRollup } from '../utils/rollups';
import { EstimateChip, PointsChip, UserPair } from './Chips';

interface Props {
  story: ApiScrumStory;
  members: MemberMap;
  /** Selected as the board's story filter (L1). */
  active?: boolean;
  onSelect?: () => void;
  /** Open the story's detail. Rendered as a sibling control, not nested —
   *  the card itself is a button (filter), and buttons can't contain buttons. */
  onOpen?: () => void;
}

/**
 * User Story card with the derived task rollup + progress bar.
 *
 * The card body toggles the board's story filter; the corner control opens the
 * story detail. Those were the same gesture until 2026-09-10, when story detail
 * was only reachable by clicking one of the story's *tasks* — which is exactly
 * what now opens the task itself instead.
 */
export default function StoryCard({
  story, members, active = false, onSelect, onOpen,
}: Props) {
  const { tasksDone, tasksTotal, pointsDone, points, percent } = storyRollup(story);
  const reporter = personOf(members, story.reporter_id, UNKNOWN_PERSON);
  const assignee = personOf(members, story.assignee_id);
  const card = (
    <button
      type="button"
      className={`gt-story${active ? ' gt-story--active' : ''}`}
      aria-pressed={active}
      onClick={onSelect}
    >
      <span className="gt-story__top">
        <span className="gt-story__key">{story.key}</span>
        {story.time_estimate && <EstimateChip estimate={story.time_estimate} />}
        {story.points != null && <PointsChip points={story.points} />}
      </span>

      <span className="gt-story__title">{story.title}</span>

      <span className="gt-story__foot">
        <UserPair reporter={reporter} assignee={assignee} />
        <span className="gt-story__rollup">
          {tasksDone}/{tasksTotal} tasks{points ? ` · ${pointsDone}/${points} pts` : ''}
        </span>
      </span>

      <span className="gt-story__bar" aria-hidden="true">
        <span className="gt-story__bar-fill" style={{ width: `${percent}%` }} />
      </span>
    </button>
  );

  if (!onOpen) return card;
  return (
    <div className="story-slot">
      {card}
      <button
        type="button"
        className="story-slot__open"
        aria-label={`Open ${story.key}`}
        title={`Open ${story.key}`}
        onClick={onOpen}
      >
        <Maximize2 size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

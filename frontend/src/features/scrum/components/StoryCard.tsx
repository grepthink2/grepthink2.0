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
}

/** User Story card with the derived task rollup + progress bar. */
export default function StoryCard({ story, members, active = false, onSelect }: Props) {
  const { tasksDone, tasksTotal, pointsDone, points, percent } = storyRollup(story);
  const reporter = personOf(members, story.reporter_id, UNKNOWN_PERSON);
  const assignee = personOf(members, story.assignee_id);
  return (
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
}

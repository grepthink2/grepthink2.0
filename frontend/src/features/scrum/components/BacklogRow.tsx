import { RotateCcw } from 'lucide-react';
import type { ApiScrumStory } from '@/lib/api';
import type { MemberMap, StoryOrderControl } from '../scrumTypes';
import { personOf, UNKNOWN_PERSON } from '../scrumTypes';
import { storyHours } from '../utils/rollups';
import { EstimateChip, PointsChip, UserPair } from './Chips';
import StoryOrderButtons from './StoryOrderButtons';

interface Props {
  story: ApiScrumStory;
  members: MemberMap;
  onOpen?: () => void;
  /** Shows the move action: into the sprint the board shows. */
  onMoveToSprint?: () => void;
  /** That sprint's name, which the move button says. */
  sprintName: string;
  /** Move up and Move down at the start of the row, for a team member. */
  order?: StoryOrderControl;
}

/** Dense backlog row: a story that isn't in a sprint (a legacy archived one included). */
export default function BacklogRow({ story, members, onOpen, onMoveToSprint, sprintName, order }: Props) {
  const reporter = personOf(members, story.reporter_id, UNKNOWN_PERSON);
  const assignee = personOf(members, story.assignee_id);
  const hours = storyHours(story);
  return (
    <div className="gt-backlog-row">
      {order && <StoryOrderButtons storyId={story.id} storyKey={story.key} control={order} />}
      <span className="gt-backlog-row__key">{story.key}</span>
      <button type="button" className="gt-backlog-row__title" onClick={onOpen}>
        {story.title}
      </button>
      <span className="gt-backlog-row__meta">
        {hours != null && <EstimateChip estimate={`${hours}h`} />}
        {story.points != null && <PointsChip points={story.points} size="sm" />}
        <UserPair reporter={reporter} assignee={assignee} tooltipSide="left" />
      </span>
      {onMoveToSprint && (
        <button
          type="button"
          className="gt-backlog-row__restore"
          aria-label={`Move ${story.key} to ${sprintName}`}
          onClick={onMoveToSprint}
        >
          <RotateCcw size={12} aria-hidden="true" />
          {`Move to ${sprintName}`}
        </button>
      )}
    </div>
  );
}

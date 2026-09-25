import { RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import type { ApiScrumStory } from '@/lib/api';
import type { MemberMap } from '../scrumTypes';
import { personOf, UNKNOWN_PERSON } from '../scrumTypes';
import { EstimateChip, PointsChip, UserPair } from './Chips';

interface Props {
  story: ApiScrumStory;
  members: MemberMap;
  onOpen?: () => void;
  /** Shows the restore action ("Move to sprint"). */
  onRestore?: () => void;
}

/** Dense archive/backlog row — the backlog doubles as the story archive (req 12). */
export default function BacklogRow({ story, members, onOpen, onRestore }: Props) {
  const reporter = personOf(members, story.reporter_id, UNKNOWN_PERSON);
  const assignee = personOf(members, story.assignee_id);
  const archived = story.archived_at ? format(new Date(story.archived_at), 'MMM d') : null;
  return (
    <div className="gt-backlog-row">
      <span className="gt-backlog-row__key">{story.key}</span>
      <button type="button" className="gt-backlog-row__title" onClick={onOpen}>
        {story.title}
      </button>
      {archived && <span className="gt-backlog-row__archived">archived {archived}</span>}
      <span className="gt-backlog-row__meta">
        {story.time_estimate && <EstimateChip estimate={story.time_estimate} />}
        {story.points != null && <PointsChip points={story.points} size="sm" />}
        <UserPair reporter={reporter} assignee={assignee} tooltipSide="left" />
      </span>
      {onRestore && (
        <button type="button" className="gt-backlog-row__restore" onClick={onRestore}>
          <RotateCcw size={12} aria-hidden="true" />
          Move to sprint
        </button>
      )}
    </div>
  );
}

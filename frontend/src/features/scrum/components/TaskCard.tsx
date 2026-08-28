import { MessageSquare, Repeat } from 'lucide-react';
import type { ApiScrumTask } from '@/lib/api';
import type { MemberMap } from '../scrumTypes';
import { personOf, UNKNOWN_PERSON } from '../scrumTypes';
import { statusLabel } from '../config/scrumTags';
import { relativeTime } from '../utils/relativeTime';
import { EstimateChip, PointsChip, PRLinkChip, UserPair } from './Chips';
import TagBadge from './TagBadge';

interface Props {
  task: ApiScrumTask;
  members: MemberMap;
  /** Parent story key ("US-3") — the chip next to the task key. */
  storyKey?: string;
  onOpen?: () => void;
}

/** The draggable unit on the board: key row, title, tags, people, PR, audit line. */
export default function TaskCard({ task, members, storyKey, onOpen }: Props) {
  const reporter = personOf(members, task.reporter_id, UNKNOWN_PERSON);
  const assignee = personOf(members, task.assignee_id);
  return (
    <div
      className={`gt-task${onOpen ? ' gt-task--clickable' : ''}`}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') onOpen(); } : undefined}
    >
      <div className="gt-task__top">
        <span className="gt-task__key">{task.key}</span>
        {storyKey && <span className="gt-task__story">{storyKey}</span>}
        <span className="gt-task__meta">
          {task.time_estimate && <EstimateChip estimate={task.time_estimate} />}
          {task.points != null && <PointsChip points={task.points} size="sm" />}
        </span>
      </div>

      <p className="gt-task__title">{task.title}</p>

      {task.tags.length > 0 && (
        <div className="gt-task__tags">
          {task.tags.map((t) => <TagBadge key={t} tag={t} />)}
        </div>
      )}

      <div className="gt-task__foot">
        <UserPair reporter={reporter} assignee={assignee} />
        <span className="gt-task__foot-right">
          {task.comment_count > 0 && (
            <span className="gt-task__comments" title={`${task.comment_count} comments`}>
              <MessageSquare size={11} aria-hidden="true" />
              {task.comment_count}
            </span>
          )}
          {task.pr_url && (
            <PRLinkChip prUrl={task.pr_url} provider={task.pr_provider} state={task.pr_state} />
          )}
        </span>
      </div>

      {task.moved_at && (
        <div className="gt-task__audit" title="Last move">
          <Repeat size={10} aria-hidden="true" />
          {statusLabel(task.status)}
          {' · '}{task.moved_by_name ?? UNKNOWN_PERSON}{' · '}{relativeTime(task.moved_at)}
        </div>
      )}
    </div>
  );
}

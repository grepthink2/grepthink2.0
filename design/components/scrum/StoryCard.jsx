import React from 'react';
import { PointsChip, EstimateChip, UserPair } from './PointsChip.jsx';

/**
 * User Story card — key, title, points + estimate, reporter → assignee,
 * child-task rollup (done/total + points) with a mini progress bar.
 */
export function StoryCard({
  storyKey,
  title,
  points,
  estimate,
  reporter,
  assignee,
  tasksDone = 0,
  tasksTotal = 0,
  pointsDone,
  active = false,
  onOpen,
  className = '',
}) {
  const pct = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  return (
    <button
      type="button"
      className={['gt-story', active ? 'gt-story--active' : '', className].filter(Boolean).join(' ')}
      onClick={onOpen}
    >
      <span className="gt-story__top">
        <span className="gt-story__key">{storyKey}</span>
        <EstimateChip estimate={estimate} />
        <PointsChip points={points} />
      </span>
      <span className="gt-story__title">{title}</span>
      <span className="gt-story__foot">
        <UserPair reporter={reporter} assignee={assignee} />
        <span className="gt-story__rollup">
          {tasksDone}/{tasksTotal} tasks{pointsDone != null ? ` · ${pointsDone}/${points} pts` : ''}
        </span>
      </span>
      <span className="gt-story__bar" aria-hidden="true">
        <span className="gt-story__bar-fill" style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

import React from 'react';
import { Badge } from '../display/Badge.jsx';
import { Button } from '../primitives/Button.jsx';

const STATUS_TONE = {
  not_started: 'neutral',
  in_progress: 'info',
  submitted: 'success',
  due_soon: 'error',
  closed: 'neutral',
};
const STATUS_LABEL = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  submitted: 'Submitted',
  due_soon: 'Due Soon',
  closed: 'Closed',
};

/**
 * Assignment card — name, due date, project, status pill and the
 * status-appropriate action (Start / Edit Submission / Closed).
 */
export function AssignmentCard({
  name,
  due,
  project,
  status = 'not_started',
  onAction,
  className = '',
}) {
  const actionLabel =
    status === 'submitted' ? 'Edit Submission'
    : status === 'closed' ? 'Closed'
    : status === 'in_progress' ? 'Continue'
    : 'Start';

  return (
    <div className={['gt-assignment-card', className].filter(Boolean).join(' ')}>
      <div className="gt-assignment-card__main">
        <span className="gt-assignment-card__name">{name}</span>
        <span className="gt-assignment-card__meta">
          Due {due}{project ? ` · ${project}` : ''}
        </span>
      </div>
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      <Button
        size="sm"
        variant={status === 'submitted' ? 'ghost' : 'primary'}
        disabled={status === 'closed'}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  );
}

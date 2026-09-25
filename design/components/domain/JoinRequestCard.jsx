import React from 'react';
import { Avatar } from '../display/Avatar.jsx';
import { Button } from '../primitives/Button.jsx';

/**
 * Join request card — requester identity, message, approve/deny actions.
 * Also covers invites via `kind="invite"`.
 */
export function JoinRequestCard({
  name,
  email,
  project,
  message,
  timestamp,
  kind = 'request',
  onApprove,
  onDeny,
  busy = false,
  className = '',
}) {
  return (
    <div className={['gt-join-request', className].filter(Boolean).join(' ')}>
      <Avatar name={name || email} size="md" />
      <div className="gt-join-request__body">
        <p className="gt-join-request__line">
          <strong>{name}</strong>
          {kind === 'request' ? ' wants to join ' : ' invited you to '}
          <strong>{project}</strong>
        </p>
        {message && <p className="gt-join-request__message">“{message}”</p>}
        {timestamp && <span className="gt-join-request__time">{timestamp}</span>}
      </div>
      <div className="gt-join-request__actions">
        <Button size="sm" variant="primary" onClick={onApprove} loading={busy}>
          {kind === 'request' ? 'Approve' : 'Accept'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDeny} disabled={busy}>
          {kind === 'request' ? 'Deny' : 'Decline'}
        </Button>
      </div>
    </div>
  );
}

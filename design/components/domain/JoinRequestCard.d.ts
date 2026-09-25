import * as React from 'react';

export interface JoinRequestCardProps {
  name: string;
  email?: string;
  /** Project the request/invite concerns. */
  project: string;
  /** Optional note from the requester. */
  message?: string;
  /** Relative time ("2h ago"). */
  timestamp?: string;
  /** 'request' = wants to join · 'invite' = invited you. @default 'request' */
  kind?: 'request' | 'invite';
  onApprove?: () => void;
  onDeny?: () => void;
  /** Disables actions while a request is in flight. @default false */
  busy?: boolean;
  className?: string;
}

export function JoinRequestCard(props: JoinRequestCardProps): React.JSX.Element;

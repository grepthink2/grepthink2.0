import * as React from 'react';

export interface RosterRowProps {
  name: string;
  email?: string;
  /** @default 'member' */
  role?: 'owner' | 'product_owner' | 'scrum_master' | 'admin' | 'member';
  /** Team label ("Team 1"). */
  team?: string;
  /** Optional status pill text ("Enrolled", "Invited"). */
  status?: string;
  /** @default 'neutral' */
  statusTone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  /** Trailing action buttons. */
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function RosterRow(props: RosterRowProps): React.JSX.Element;

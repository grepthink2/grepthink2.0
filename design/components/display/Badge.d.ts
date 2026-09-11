import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  /** Semantic tone (soft bg + colored text). @default 'neutral' */
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'gold';
  /** Project-role preset — overrides tone. */
  role?: 'owner' | 'product_owner' | 'scrum_master' | 'admin' | 'member';
  /** Solid fill instead of soft. @default false */
  solid?: boolean;
}

/**
 * Status & role pill.
 * @startingPoint section="Primitives" subtitle="Status + role pills" viewport="700x120"
 */
export function Badge(props: BadgeProps): React.JSX.Element;

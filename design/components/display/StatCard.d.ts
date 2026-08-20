import * as React from 'react';

export interface StatCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Uppercase metric label ("TSRS SUBMITTED"). */
  label: string;
  /** Big number/value. */
  value: React.ReactNode;
  /** Muted line under the value. */
  hint?: string;
  /** Icon in the tinted chip. */
  icon?: React.ReactNode;
  /** Tint for the icon chip. @default 'primary' */
  accent?: 'primary' | 'blue' | 'purple' | 'amber';
  /** Makes the card a clickable button. */
  onClick?: () => void;
}

export function StatCard(props: StatCardProps): React.JSX.Element;

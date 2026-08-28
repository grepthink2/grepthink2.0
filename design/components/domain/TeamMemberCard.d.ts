import * as React from 'react';

export interface TeamMemberCardProps {
  name: string;
  email?: string;
  /** @default 'member' */
  role?: 'owner' | 'product_owner' | 'scrum_master' | 'admin' | 'member';
  /** Skill tags. */
  skills?: string[];
  /** Action row (RoleSelect, remove button…). */
  actions?: React.ReactNode;
  className?: string;
}

export interface RoleSelectProps {
  /** @default 'member' */
  value?: 'owner' | 'product_owner' | 'scrum_master' | 'admin' | 'member';
  onChange?: (role: string) => void;
  disabled?: boolean;
  className?: string;
}

export function TeamMemberCard(props: TeamMemberCardProps): React.JSX.Element;
/** Compact role dropdown for member management. */
export function RoleSelect(props: RoleSelectProps): React.JSX.Element;

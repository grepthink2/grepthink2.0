// Intentional addition: TeamMemberCard — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface TeamMemberCardProps {
  name: string;
  email?: string;
  /** @default 'member' */
  role?: 'owner' | 'product_owner' | 'scrum_master' | 'admin' | 'member';
  /** Skill tags. */
  skills?: string[];
  /** Action row (a quiet Remove, an admin Toggle…). */
  actions?: React.ReactNode;
  className?: string;
}

export function TeamMemberCard(props: TeamMemberCardProps): React.JSX.Element;

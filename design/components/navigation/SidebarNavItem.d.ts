import * as React from 'react';

export interface SidebarNavItemProps {
  icon?: React.ReactNode;
  label: React.ReactNode;
  /** Light chip + left half-pill indicator. @default false */
  active?: boolean;
  /** Unread-count badge (red pill), hidden when 0. */
  badge?: number;
  /** Icon-only rendering for the collapsed sidebar. @default false */
  collapsed?: boolean;
  onClick?: () => void;
  className?: string;
}

export interface SidebarSectionTitleProps {
  children: React.ReactNode;
}

export function SidebarNavItem(props: SidebarNavItemProps): React.JSX.Element;
export function SidebarSectionTitle(props: SidebarSectionTitleProps): React.JSX.Element;

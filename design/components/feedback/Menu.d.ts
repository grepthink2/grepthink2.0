import * as React from 'react';

export interface MenuProps {
  children: React.ReactNode;
  /** Called on Esc (also bubbles to the wrapping Popover). */
  onClose?: () => void;
  ariaLabel?: string;
  /** Focus the first item on mount (real menus; keep false in galleries). @default false */
  autoFocus?: boolean;
  className?: string;
}

export interface MenuItemProps {
  /** 16px lucide icon slot. */
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Right-aligned mono shortcut hint (e.g. '⌘K'). */
  shortcut?: string;
  /** Error-pair styling for destructive actions. @default false */
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  className?: string;
}

/** Action list for Popover: role="menu", arrow keys, Enter, Esc. */
export function Menu(props: MenuProps): React.JSX.Element;
/** ~32px action row with icon, label, shortcut; destructive variant. */
export function MenuItem(props: MenuItemProps): React.JSX.Element;
/** Thin rule between item groups. */
export function MenuSeparator(): React.JSX.Element;

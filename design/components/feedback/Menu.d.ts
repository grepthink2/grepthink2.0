import * as React from 'react';

export interface MenuProps {
  children: React.ReactNode;
  /** Called on Esc (also bubbles to the wrapping Popover). */
  onClose?: () => void;
  ariaLabel?: string;
  /** Focus the first item on mount (menus opened from a button); 'checked' focuses the checked row. Adopted from the codebase. @default false */
  autoFocus?: boolean | 'checked';
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
  /** Makes the row a `menuitemcheckbox` (multi-select). Adopted from the codebase. */
  checked?: boolean;
  /** With `checked`: a `menuitemradio` (one choice in the menu). @default false */
  radio?: boolean;
  onSelect?: () => void;
  className?: string;
}

/** Action list for Popover: role="menu", arrow keys, Enter, Esc. */
export function Menu(props: MenuProps): React.JSX.Element;
/** 32px action / checkbox / radio row with icon, label, shortcut; destructive variant. */
export function MenuItem(props: MenuItemProps): React.JSX.Element;
/** Thin rule between item groups. */
export function MenuSeparator(): React.JSX.Element;

import * as React from 'react';

export interface DrawerProps {
  open?: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** Pinned action row (outline Cancel, primary Save). */
  footer?: React.ReactNode;
  /** 'right' for editors, 'left' for the phone navigation. @default 'right' */
  side?: 'right' | 'left';
  /** Width in px or CSS. @default 420 */
  width?: number | string;
  /** @default false */
  closeDisabled?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Name when there is no visible title (phone navigation: "Main menu"). */
  ariaLabel?: string;
  /** @default true */
  portal?: boolean;
  className?: string;
}

/** Side sheet with the Modal's behaviour. */
export function Drawer(props: DrawerProps): React.JSX.Element | null;

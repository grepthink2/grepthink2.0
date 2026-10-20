import * as React from 'react';

export interface ModalProps {
  open?: boolean;
  /** Esc, the scrim and the × call it (topmost dialog only). */
  onClose?: () => void;
  /** Visible heading; labels the dialog. Never forwarded as the HTML title attribute. */
  title?: React.ReactNode;
  /** Second line; describes the dialog. */
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** Pinned action row, right-aligned: outline Cancel, then the primary action. */
  footer?: React.ReactNode;
  /** Form header slot under the title — a <Tabs> strip (Edit Project). */
  tabs?: React.ReactNode;
  /** sm 400 (confirm, message) · md 560 (forms) · lg 760 (Edit Project). @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Legacy max-width override in px. */
  width?: number;
  /** 'form': title left 18/600, tabs below, pinned footer. 'message': centred 28px title. @default 'form' */
  variant?: 'form' | 'message';
  /** Holds the dialog open while it saves (× disabled, Esc / scrim ignored). @default false */
  closeDisabled?: boolean;
  /** Element to focus on open (default: [data-autofocus], then the first field, then the sheet). */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** @default false */
  hideClose?: boolean;
  /** 'alertdialog' for confirmations (ConfirmDialog sets it). @default 'dialog' */
  role?: 'dialog' | 'alertdialog';
  /** false renders in place instead of in <body> (galleries, tests). @default true */
  portal?: boolean;
  className?: string;
}

export function Modal(props: ModalProps): React.JSX.Element | null;

/** Shared dialog behaviour (stack, focus in / trap / return, scroll lock, exit fade). */
export function useDialog(options: {
  open: boolean;
  onClose?: () => void;
  closeDisabled?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  sheetRef: React.RefObject<HTMLElement>;
  exitMs?: number;
  /** Rendered in place (galleries): no stack, trap, scroll lock or focus move. */
  inPlace?: boolean;
}): { mounted: boolean; closing: boolean; onScrimDown: (e: React.MouseEvent) => void };

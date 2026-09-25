import * as React from 'react';

export type ToastVariant = 'success' | 'error' | 'info' | 'neutral';

export interface ToastProps {
  /** 'neutral' renders with the info pair. @default 'info' */
  variant?: ToastVariant;
  message: string;
  /** Text-style action, e.g. "Undo" / "Retry". */
  actionLabel?: string;
  onAction?: () => void;
  /** Enables the × dismiss and auto-dismiss timer. */
  onDismiss?: () => void;
  /** ms; 0 = sticky. @default 5000 (error: 8000; error+action: sticky) */
  duration?: number;
  className?: string;
}

export interface ToastItem extends Omit<ToastProps, 'onDismiss'> {
  id: string | number;
}

export interface ToastStackProps {
  /** Newest first; only the first 3 render. */
  toasts?: ToastItem[];
  /** Called with the toast id when one dismisses. */
  onDismiss?: (id: string | number) => void;
  children?: React.ReactNode;
  className?: string;
}

/** Single toast: left accent bar, icon, message, optional action, ×. */
export function Toast(props: ToastProps): React.JSX.Element;
/** Fixed bottom-right stack — max 3, newest on top, 8px gap. */
export function ToastStack(props: ToastStackProps): React.JSX.Element;

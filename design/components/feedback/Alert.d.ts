import * as React from 'react';

export interface AlertProps {
  /** @default 'info' */
  tone?: 'success' | 'warning' | 'error' | 'info';
  /** Bold first line. */
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Shows a dismiss ×. */
  onDismiss?: () => void;
  className?: string;
}

export interface ToastProps {
  /** @default 'success' */
  tone?: 'success' | 'warning' | 'error' | 'info';
  title?: React.ReactNode;
  children?: React.ReactNode;
  onDismiss?: () => void;
}

export interface ToastStackProps {
  children: React.ReactNode;
}

/** Inline alert using the semantic soft/text pairs. */
export function Alert(props: AlertProps): React.JSX.Element;
/** Floating toast visual (place inside ToastStack). */
export function Toast(props: ToastProps): React.JSX.Element;
/** Fixed bottom-right toast container. */
export function ToastStack(props: ToastStackProps): React.JSX.Element;

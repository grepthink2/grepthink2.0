// Intentional addition: ConfirmDialog, InlineConfirm — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface ConfirmDialogProps {
  open?: boolean;
  /** Question naming the action: "Delete Sprint 3 planning?" */
  title: React.ReactNode;
  /** Names the thing and the consequence: "It disappears from your team's calendars." */
  message: React.ReactNode;
  /** @default 'Confirm' */
  confirmLabel?: string;
  /** Busy label ("Deleting…"). */
  busyLabel?: string;
  /** @default 'Cancel' */
  cancelLabel?: string;
  /** Confirm becomes the solid danger button. @default false */
  destructive?: boolean;
  /** May return a promise: busy while pending; a rejection shows `errorText`. Close the dialog on success yourself. */
  onConfirm?: () => void | Promise<unknown>;
  /** Cancel, Esc and the scrim (blocked while busy). */
  onCancel?: () => void;
  /** Controlled busy state (otherwise derived from the promise). */
  busy?: boolean;
  /** Controlled error message (otherwise `errorText` after a rejection). */
  error?: React.ReactNode;
  /** @default 'That didn’t work. Try again.' */
  errorText?: string;
  /** @default true */
  portal?: boolean;
}

export interface InlineConfirmProps {
  /** "Delete 'Sprint 3 planning'? It disappears from your team's calendars." */
  message: React.ReactNode;
  /** @default 'Delete' */
  confirmLabel?: string;
  /** @default 'Deleting…' */
  busyLabel?: string;
  /** @default 'Cancel' */
  cancelLabel?: string;
  busy?: boolean;
  /** Focus Cancel on mount (the row just turned into the confirm). @default true */
  autoFocus?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  className?: string;
}

/** Confirmation alertdialog (Cancel first, danger Confirm, busy + error inside). */
export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element | null;
/** Inline confirm row for a row-level delete inside a dialog. */
export function InlineConfirm(props: InlineConfirmProps): React.JSX.Element;

import {
  useEffect, useId, useRef, useState, type HTMLAttributes, type KeyboardEvent, type ReactNode, type Ref,
} from 'react';
import { CircleAlert } from 'lucide-react';
import { Alert } from '@/components/Alert/Alert';
import { Button } from '@/components/Button/Button';
import { Modal } from '@/components/Modal/Modal';
import './ConfirmDialog.scss';

export interface ConfirmDialogProps {
  /** @default false */
  open?: boolean;
  /** The question that names the action: "Delete Sprint 3 planning?" */
  title: ReactNode;
  /** Names the thing and the consequence: "It disappears from your team's calendars." */
  message: ReactNode;
  /** @default 'Confirm' */
  confirmLabel?: string;
  /** Confirm's label while it is busy ("Deleting…"). @default confirmLabel */
  busyLabel?: string;
  /** @default 'Cancel' */
  cancelLabel?: string;
  /** Confirm becomes the solid danger button. @default false */
  destructive?: boolean;
  /**
   * Confirm runs it. It may return a promise: the dialog is busy while it runs, and a rejection shows
   * `errorText` inside the dialog. Close the dialog on success yourself.
   */
  onConfirm?: () => void | Promise<unknown>;
  /** Cancel, Esc, the scrim and the ×; none of them while busy. */
  onCancel?: () => void;
  /**
   * Busy from the caller, in place of the state onConfirm's promise gives: `busy={false}` re-enables
   * Confirm even while that promise is still pending.
   */
  busy?: boolean;
  /** An error from the caller (an API's message), in place of `errorText` after a rejection. */
  error?: ReactNode;
  /** What a rejected or throwing onConfirm shows. @default 'That didn’t work. Try again.' */
  errorText?: string;
  /** false renders it in place instead of in `<body>` (galleries, harness pages). @default true */
  portal?: boolean;
  /** Goes on the sheet. */
  className?: string;
  /** Reaches the sheet while it is mounted. */
  ref?: Ref<HTMLDivElement>;
}

/** The confirmation in flight or failed, by the number of the try that started it. */
type Attempt = { run: number; state: 'pending' | 'failed' } | null;

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as PromiseLike<unknown> | null | undefined)?.then === 'function';

/**
 * Asks before an action that cannot be undone, ported from design/components/feedback/ConfirmDialog.jsx:
 * the WAI-ARIA alert dialog on the Modal shell (sm), with the title as the question and the message,
 * which describes the dialog, naming the thing and the consequence. Cancel (outline) takes focus
 * first; Confirm is primary, or solid danger when `destructive`. Cancel, Esc, the scrim and the × all
 * call `onCancel`.
 *
 * While the promise `onConfirm` returns is pending, Confirm shows `busyLabel` with the spinner and
 * keeps focus, Cancel and the × are disabled, and Esc and the scrim do nothing. A rejection, or a
 * throw, keeps the dialog open with an error Alert under the message (`errorText`, or the caller's
 * `error`), and the next try clears it. Each open starts clean, and a try that settles after the
 * dialog closed and opened again changes nothing. A dialog inside another dialog that needs a
 * row-level confirm uses InlineConfirm instead.
 *
 * Codebase-side: `className` and `ref` reach the sheet.
 */
export function ConfirmDialog({
  open = false, title, message, confirmLabel = 'Confirm', busyLabel, cancelLabel = 'Cancel', destructive = false,
  onConfirm, onCancel, busy: busyProp, error: errorProp, errorText = 'That didn’t work. Try again.', portal = true,
  className, ref,
}: ConfirmDialogProps) {
  const messageId = useId();
  const runs = useRef(0);
  const [attempt, setAttempt] = useState<Attempt>(null);
  // Each open starts clean. Adjusted while rendering the change rather than in an effect.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setAttempt(null);
  }

  const busy = busyProp ?? attempt?.state === 'pending';
  const error = errorProp ?? (attempt?.state === 'failed' ? errorText : null);

  const confirm = () => {
    if (busy || !onConfirm) return;
    const run = ++runs.current;
    let result: unknown;
    try {
      result = onConfirm();
    } catch {
      setAttempt({ run, state: 'failed' });
      return;
    }
    if (!isThenable(result)) {
      setAttempt(null);
      return;
    }
    setAttempt({ run, state: 'pending' });
    result.then(
      () => setAttempt((now) => (now?.run === run ? null : now)),
      () => setAttempt((now) => (now?.run === run ? { run, state: 'failed' } : now)),
    );
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      role="alertdialog"
      closeDisabled={busy}
      portal={portal}
      className={className}
      aria-describedby={messageId}
      ref={ref}
      footer={(
        <>
          <Button variant="outline" onClick={() => onCancel?.()} disabled={busy} data-autofocus>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={confirm} loading={busy} loadingLabel={busyLabel}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <p className="gt-confirm__message" id={messageId}>{message}</p>
      {error && <Alert tone="error" className="gt-confirm__error">{error}</Alert>}
    </Modal>
  );
}

export interface InlineConfirmProps extends Omit<HTMLAttributes<HTMLDivElement>, 'role' | 'children'> {
  /** "Delete 'Sprint 3 planning'? It disappears from your team's calendars." It names the group. */
  message: ReactNode;
  /** @default 'Delete' */
  confirmLabel?: string;
  /** @default 'Deleting…' */
  busyLabel?: string;
  /** @default 'Cancel' */
  cancelLabel?: string;
  /** @default false */
  busy?: boolean;
  /** Focus Cancel on mount: the row just turned into the confirm. @default true */
  autoFocus?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  /**
   * Set by the row itself: `role="group"`, named by its message. JSX takes any hyphenated prop a type
   * leaves out, so `aria-labelledby` is declared `never`, and `role` with it.
   */
  role?: never;
  'aria-labelledby'?: never;
  ref?: Ref<HTMLDivElement>;
}

/**
 * The row-level delete inside a dialog, never a dialog over a dialog, ported from InlineConfirm in
 * design/components/feedback/ConfirmDialog.jsx (team meetings' confirm row is its model): a muted
 * strip with a red alert disc, the sentence, outline Cancel and danger Delete, as a `role="group"`
 * named by the sentence. Cancel takes focus when it mounts; Esc cancels without closing the dialog
 * around it. While `busy`, Delete shows `busyLabel` and keeps focus, and Cancel waits.
 *
 * Native props and `ref` reach the group; a caller's `onKeyDown` runs first, and an Esc it prevents is
 * left alone. Codebase-side: Esc is stopped while busy too, so it never reaches the dialog around the
 * row in the middle of a delete.
 */
export function InlineConfirm({
  message, confirmLabel = 'Delete', busyLabel = 'Deleting…', cancelLabel = 'Cancel', busy = false, autoFocus = true,
  onConfirm, onCancel, className = '', onKeyDown, ref, ...rest
}: InlineConfirmProps) {
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Cancel takes focus once, when the row turns into the confirm, whatever autoFocus does later.
  const [focusOnMount] = useState(autoFocus);
  useEffect(() => {
    if (focusOnMount) cancelRef.current?.focus();
  }, [focusOnMount]);

  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.stopPropagation();
    e.preventDefault();
    if (!busy) onCancel?.();
  };

  return (
    <div
      {...rest}
      ref={ref}
      className={['gt-inline-confirm', className].filter(Boolean).join(' ')}
      role="group"
      aria-labelledby={messageId}
      onKeyDown={keyDown}
    >
      <span className="gt-inline-confirm__icon"><CircleAlert size={14} strokeWidth={2.2} aria-hidden="true" /></span>
      <p className="gt-inline-confirm__text" id={messageId}>{message}</p>
      <span className="gt-inline-confirm__actions">
        <Button variant="outline" size="sm" onClick={() => onCancel?.()} disabled={busy} ref={cancelRef}>{cancelLabel}</Button>
        <Button variant="danger" size="sm" onClick={() => onConfirm?.()} loading={busy} loadingLabel={busyLabel}>{confirmLabel}</Button>
      </span>
    </div>
  );
}

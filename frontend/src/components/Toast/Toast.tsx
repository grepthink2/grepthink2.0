import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import './Toast.scss';

export type ToastVariant = 'success' | 'error' | 'info' | 'neutral';

export interface ToastProps {
  variant?: ToastVariant;
  message: string;
  /** Text-style action, e.g. "Retry". */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  /** ms; 0 = sticky. Defaults: 5s, errors 8s, error+action sticky. */
  duration?: number;
}

export interface ToastItem extends Omit<ToastProps, 'onDismiss'> {
  id: string | number;
}

const ICONS = { success: CheckCircle2, error: XCircle, info: Info } as const;
const EXIT_MS = 150;

/** Single toast — accent bar, icon, message, optional action, dismiss. */
export function Toast({ variant = 'info', message, actionLabel, onAction, onDismiss, duration }: ToastProps) {
  const v = variant === 'neutral' ? 'info' : variant;
  const [leaving, setLeaving] = useState(false);
  const Icon = ICONS[v];

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => onDismiss?.(), EXIT_MS);
  }, [onDismiss]);

  useEffect(() => {
    // An error you can act on waits for the user; everything else fades out.
    const ms = duration !== undefined ? duration : v === 'error' ? (actionLabel ? 0 : 8000) : 5000;
    if (!ms || !onDismiss) return;
    const id = window.setTimeout(dismiss, ms);
    return () => window.clearTimeout(id);
  }, [duration, v, actionLabel, dismiss, onDismiss]);

  return (
    <div
      className={`gt-toast gt-toast--${v}${leaving ? ' gt-toast--leaving' : ''}`}
      role={v === 'error' ? 'alert' : 'status'}
    >
      <span className="gt-toast__icon"><Icon size={16} aria-hidden="true" /></span>
      <p className="gt-toast__msg">{message}</p>
      {actionLabel && (
        <button type="button" className="gt-toast__action" onClick={onAction}>{actionLabel}</button>
      )}
      {onDismiss && (
        <button type="button" className="gt-toast__dismiss" aria-label="Dismiss" onClick={dismiss}>
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Fixed bottom-right container — newest first, at most three visible. */
export function ToastStack({ toasts = [], onDismiss }: {
  toasts?: ToastItem[];
  onDismiss?: (id: string | number) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="gt-toast-stack">
      {toasts.slice(0, 3).map((t) => (
        <Toast key={t.id} {...t} onDismiss={onDismiss ? () => onDismiss(t.id) : undefined} />
      ))}
    </div>
  );
}

import { useCallback, useRef, useState } from 'react';
import type { ToastItem, ToastVariant } from './Toast';

/** Queue for the ToastStack — newest first, so the stack shows the latest three. */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((variant: ToastVariant, message: string, extra: Partial<ToastItem> = {}) => {
    const id = ++nextId.current;
    setToasts((prev) => [{ id, variant, message, ...extra }, ...prev]);
    return id;
  }, []);

  const dismiss = useCallback((id: string | number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

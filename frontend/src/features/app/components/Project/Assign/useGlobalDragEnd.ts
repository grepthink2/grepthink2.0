import { useEffect } from 'react';

/**
 * Calls `onEnd` whenever any drag operation finishes on the page.
 * `dragend` fires on the drag source regardless of whether a drop succeeded,
 * making this the reliable way to clear transient drag-over UI when a child
 * drop target used stopPropagation and the parent's drop handler never ran.
 */
export function useGlobalDragEnd(onEnd: () => void) {
  useEffect(() => {
    const handler = () => onEnd();
    window.addEventListener('dragend', handler);
    return () => window.removeEventListener('dragend', handler);
  }, [onEnd]);
}

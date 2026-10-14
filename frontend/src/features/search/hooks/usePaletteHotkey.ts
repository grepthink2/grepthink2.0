import { useEffect } from 'react';

/**
 * ⌘K / Ctrl+K anywhere in the app, including inside text fields. A chord another listener
 * already handled (`defaultPrevented` — the roster invite editor's link panel binds ⌘K on
 * `document`, which runs before `window`), a key repeat, or Shift/Alt variants are ignored.
 */
export function usePaletteHotkey(onToggle: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== 'k' || e.repeat || e.defaultPrevented) return;
      e.preventDefault(); // Firefox would focus the address bar on Ctrl+K
      onToggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onToggle, enabled]);
}

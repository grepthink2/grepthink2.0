/**
 * Esc for an open calendar, heard before any other listener. While it is open the calendar is the
 * topmost layer, above the modal, popover or panel it opened from. Those listen for Esc on the
 * document or the window, some in the capture phase, from the moment they open, and listeners on
 * one node run in the order they were added, so a listener the calendar added when it opened would
 * hear the key after theirs. This one is added once, when the module loads: on the window, where an
 * event's dispatch starts, in the capture phase. It takes the key only while a calendar is open, and
 * then nothing else hears it.
 */
const closers: (() => void)[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    const close = closers[closers.length - 1];
    if (!close || e.key !== 'Escape' || e.isComposing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  }, true);
}

/** Makes `close` what Esc does until the returned function is called; the last one added wins. */
export function onCalendarEscape(close: () => void): () => void {
  closers.push(close);
  return () => {
    const at = closers.lastIndexOf(close);
    if (at !== -1) closers.splice(at, 1);
  };
}

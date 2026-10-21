let locks = 0;
let saved = '';

/**
 * Stops the page scrolling behind an open dialog, and returns the release. Counted: the first lock
 * saves `body`'s inline `overflow` and sets `hidden`, and only the last release puts the saved value
 * back, so dialogs that close in any order never unlock the page under one that is still open. A
 * release counts once, however often it is called.
 */
export function lockBodyScroll(): () => void {
  if (locks === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0) document.body.style.overflow = saved;
  };
}

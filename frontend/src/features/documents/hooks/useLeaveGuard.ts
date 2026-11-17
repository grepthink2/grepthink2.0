import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';

/** A navigator method: `push` and `replace` take the place, its state and the options. */
type Go = (...args: unknown[]) => void;

/** The two navigator methods every in-app navigation goes through (a Link, `navigate()`). */
interface Navigates {
  push: Go;
  replace: Go;
}

/** A navigation's target as a path and query, for comparing it with the current location. */
function pathOf(to: unknown): string {
  if (typeof to === 'string') return to;
  const { pathname = '', search = '' } = (to ?? {}) as { pathname?: string; search?: string };
  return `${pathname}${search}`;
}

/**
 * Wraps a navigator's `push` and `replace` in `hold`, and answers the function that puts them back.
 * The router's navigator is shared by the whole app, so the guard changes it only while it holds.
 */
function wrapNavigator(navigator: unknown, hold: (original: Go) => Go): () => void {
  const nav = navigator as Navigates;
  const { push, replace } = nav;
  nav.push = hold(push);
  nav.replace = hold(replace);
  return () => {
    nav.push = push;
    nav.replace = replace;
  };
}

/**
 * Asks before leaving a page whose changes are not saved, while `when` holds.
 *
 * The browser's own leaving (a reload, closing the tab, another site) gets its `beforeunload` prompt.
 * In-app navigation is held for the page to ask about: the app's router is a `BrowserRouter`, not a
 * data router, so React Router's `useBlocker` is not available, and the guard wraps the router's
 * navigator instead (`push` and `replace`, which every Link and `navigate()` call). A navigation to the
 * page's own path and query passes. `blocked` says one is held: `proceed` makes it, `stay` drops it.
 * When `when` turns false with one held (a save in flight lands), there is nothing left to ask about,
 * so the held navigation is made. `leave(go)` runs a navigation the page means to make whatever is
 * unsaved (after a delete). The browser's Back and Forward are not held.
 */
export function useLeaveGuard(when: boolean) {
  const { navigator } = useContext(UNSAFE_NavigationContext);
  const location = useLocation();
  const [held, setHeld] = useState<{ go: () => void } | null>(null);
  // The same navigation for the effect that makes it once the page is clean: state is for the dialog.
  const heldRef = useRef<{ go: () => void } | null>(null);
  const here = useRef('');
  const allowNext = useRef(false);
  useEffect(() => {
    here.current = `${location.pathname}${location.search}`;
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!when) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers show their prompt only for a returnValue.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [when]);

  useEffect(() => {
    if (!when) return undefined;
    const hold = (original: Go): Go => (...args) => {
      if (allowNext.current || pathOf(args[0]) === here.current) {
        allowNext.current = false;
        original(...args);
        return;
      }
      const go = { go: () => original(...args) };
      heldRef.current = go;
      setHeld(go);
    };
    return wrapNavigator(navigator, hold);
  }, [when, navigator]);

  // Clean again with a navigation held: the dialog goes, and the effect below makes the navigation.
  if (!when && held !== null) setHeld(null);
  useEffect(() => {
    if (when) return;
    const pending = heldRef.current;
    heldRef.current = null;
    pending?.go();
  }, [when]);

  // The held navigation calls the navigator's own method, past the guard.
  const proceed = useCallback(() => {
    if (!held) return;
    heldRef.current = null;
    setHeld(null);
    held.go();
  }, [held]);
  const stay = useCallback(() => {
    heldRef.current = null;
    setHeld(null);
  }, []);
  const leave = useCallback((go: () => void) => {
    allowNext.current = true;
    go();
  }, []);

  return { blocked: when && held !== null, proceed, stay, leave };
}

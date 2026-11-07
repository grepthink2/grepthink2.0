/**
 * Where to go after a sign-in that leaves the site (Google): the page that sent the visitor to
 * log in. Only the connected-app consent page (`/oauth/consent?...`) is ever remembered, so a
 * stored value cannot send anyone elsewhere after they sign in.
 */
const KEY = 'gt:returnTo';
const ALLOWED = /^\/oauth\/consent(\?|$)/;

export function rememberReturnTo(path: string): void {
  if (ALLOWED.test(path)) sessionStorage.setItem(KEY, path);
}

/** The remembered path, once: reading it forgets it. */
export function takeReturnTo(): string | null {
  const path = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return path && ALLOWED.test(path) ? path : null;
}

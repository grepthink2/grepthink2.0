/**
 * Send the browser to another site (a full page load), such as an app's OAuth return address. Its own
 * module so tests can replace it.
 *
 * A `javascript:` or `data:` address would run in this page, on this site's origin, with the
 * student's session in reach: those are refused here as well as by the backend, so a return address
 * an app registered can never become code on grepthink2.com.
 */
const BLOCKED_SCHEMES = new Set(['javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:']);

export function isSafeExternalUrl(url: string): boolean {
  try {
    return !BLOCKED_SCHEMES.has(new URL(url).protocol.toLowerCase());
  } catch {
    return false;
  }
}

export function leaveSiteTo(url: string): void {
  if (!isSafeExternalUrl(url)) throw new Error('Refusing to open an unsafe address');
  window.location.assign(url);
}

/** Send the browser to another site (a full page load). Its own module so tests can replace it. */
export function leaveSiteTo(url: string): void {
  window.location.assign(url);
}

/** Reloads the page, for the latest build after a deploy. Its own module so tests can mock it (jsdom's location can't be stubbed). */
export function reloadPage(): void {
  window.location.reload();
}

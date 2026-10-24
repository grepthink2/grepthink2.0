/**
 * The feed's chunk: ReleaseFeed with the parsed notes and the Markdown renderer. WhatsNewModal loads
 * it on the first open; the triggers warm it a moment earlier.
 */
export const loadReleaseFeed = () => import('./components/ReleaseFeed');

/** Starts loading the feed. A failure here is ignored: the modal shows its own when it opens. */
export function preloadReleaseFeed(): void {
  loadReleaseFeed().catch(() => {});
}

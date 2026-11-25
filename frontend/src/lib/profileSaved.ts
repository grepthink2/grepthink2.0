/**
 * Settings saves a profile; a page that shows that profile is somewhere else in the tree, behind
 * the modal. Settings says so on `window`, as `openSettings` asks the shell to open it, and the
 * page asks for the profile again.
 */
export const PROFILE_SAVED_EVENT = 'gt:profile-saved';

/** Called once a profile save has reached the server. */
export function announceProfileSaved(): void {
  window.dispatchEvent(new Event(PROFILE_SAVED_EVENT));
}

/**
 * Asks the app shell to open Settings on one of its sections (AppView listens), as
 * `openClassSelector` asks it for the class selector. A page calls this for "Edit profile"; it
 * knows nothing about the shell or the modal.
 */
export type SettingsSection = 'profile' | 'email' | 'apps';

export const OPEN_SETTINGS_EVENT = 'gt:open-settings';

export function openSettings(section: SettingsSection = 'profile'): void {
  window.dispatchEvent(new CustomEvent<{ section: SettingsSection }>(OPEN_SETTINGS_EVENT, { detail: { section } }));
}

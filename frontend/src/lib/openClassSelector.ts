/**
 * Asks the app shell to open the class selector: the sidebar opens its class menu and focuses it,
 * and on a phone the navigation drawer around it opens first (Sidebar and AppView listen). Pages
 * that need a class pass this to NoClassSelected's `onSelectClass`; the shared component itself knows
 * nothing about the shell.
 */
export const OPEN_CLASS_SELECTOR_EVENT = 'gt:open-class-selector';

export function openClassSelector(): void {
  window.dispatchEvent(new Event(OPEN_CLASS_SELECTOR_EVENT));
}

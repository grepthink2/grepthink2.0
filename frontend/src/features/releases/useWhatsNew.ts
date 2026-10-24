import { useSyncExternalStore } from 'react';
import { isUnseen, readSeen, subscribe } from './seenStore';

/**
 * The seen state for a What's new trigger: `unseen` shows the dot, and `lastSeen` is the release this
 * browser last opened the modal on. Every trigger reads the one store, so an opening clears them all,
 * in the site's other tabs too.
 */
export function useWhatsNew(): { unseen: boolean; lastSeen: string | null } {
  const lastSeen = useSyncExternalStore(subscribe, readSeen);
  return { unseen: isUnseen(lastSeen), lastSeen };
}

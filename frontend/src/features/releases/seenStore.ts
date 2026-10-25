import { APP_VERSION, compareVersions, parseVersion } from './version';

/**
 * Which release this browser last opened What's new on, kept per browser in localStorage. The landing
 * page and the app share it (one origin), and signing in or out never touches it.
 *
 * Storage can throw (blocked site data, private browsing, a full quota): a read that throws counts as
 * nothing stored, and a write that throws is dropped. The page also remembers an opening in memory, so
 * the dot stays cleared until the next page load even when storage refuses the write.
 */
export const SEEN_KEY = 'gt:whats-new:seen';

/** This page's own record of an opening; it resets on reload. */
let opened: string | null = null;
const listeners = new Set<() => void>();

function readStored(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

function writeStored(version: string): void {
  try {
    window.localStorage.setItem(SEEN_KEY, version);
  } catch {
    // Blocked or full: the in-memory value carries the opening for the rest of this page's life.
  }
}

/** The higher of two values, each counted only when it is a version. */
function higher(a: string | null, b: string | null): string | null {
  const left = a !== null && parseVersion(a) ? a : null;
  const right = b !== null && parseVersion(b) ? b : null;
  if (left === null) return right;
  if (right === null) return left;
  return compareVersions(left, right) >= 0 ? left : right;
}

/** The newest release this browser has opened What's new on, or null when there is none. */
export function readSeen(): string | null {
  return higher(readStored(), opened);
}

/** Whether a dot shows: nothing seen yet, or a release older than `current`. A higher one (a rollback) counts as seen. */
export function isUnseen(lastSeen: string | null, current: string = APP_VERSION): boolean {
  return lastSeen === null || compareVersions(lastSeen, current) < 0;
}

/**
 * Whether a release carries the "New" marker: newer than the one last seen, or on a first visit
 * (`lastSeen` null) only the newest release.
 */
export function isReleaseNew(version: string, lastSeen: string | null, newest: string): boolean {
  return lastSeen === null ? version === newest : compareVersions(version, lastSeen) > 0;
}

/**
 * Marks the current release seen and returns what was seen before, which the modal keeps while it
 * is open so its "New" markers stay put. Every subscriber hears it.
 */
export function openWhatsNew(): string | null {
  const before = readSeen();
  const seen = higher(before, APP_VERSION) ?? APP_VERSION;
  opened = seen;
  writeStored(seen);
  for (const listener of [...listeners]) listener();
  return before;
}

function onStorage(event: StorageEvent): void {
  // A null key is storage cleared in another tab.
  if (event.key !== SEEN_KEY && event.key !== null) return;
  for (const listener of [...listeners]) listener();
}

/** useSyncExternalStore's subscribe: openings on this page, and changes made in the site's other tabs. */
export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

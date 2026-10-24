import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../version';

type Store = typeof import('../seenStore');
let store: Store;

/** A fresh module, as on a page load: the in-memory value starts empty. */
async function load(): Promise<Store> {
  vi.resetModules();
  return import('../seenStore');
}

beforeEach(async () => {
  localStorage.clear();
  store = await load();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('readSeen', () => {
  it('is null with nothing stored, and with a value that is not a version', () => {
    expect(store.readSeen()).toBeNull();
    localStorage.setItem(store.SEEN_KEY, 'garbage');
    expect(store.readSeen()).toBeNull();
  });

  it('reads a stored version', () => {
    localStorage.setItem(store.SEEN_KEY, '0.90.0');
    expect(store.readSeen()).toBe('0.90.0');
  });

  it('counts a read that throws as nothing stored', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(store.readSeen()).toBeNull();
  });
});

describe('isUnseen', () => {
  it('is true with nothing seen and with an older version', () => {
    expect(store.isUnseen(null)).toBe(true);
    expect(store.isUnseen('0.90.0')).toBe(true);
  });

  it('is false for the current version and a higher one (a rollback)', () => {
    expect(store.isUnseen(APP_VERSION)).toBe(false);
    expect(store.isUnseen('9.0.0')).toBe(false);
  });
});

describe('isReleaseNew', () => {
  it('marks every release newer than the one last seen', () => {
    expect(store.isReleaseNew('0.92.0', '0.91.0', '0.92.0')).toBe(true);
    expect(store.isReleaseNew('0.91.1', '0.91.0', '0.92.0')).toBe(true);
    expect(store.isReleaseNew('0.91.0', '0.91.0', '0.92.0')).toBe(false);
  });

  it('marks only the newest on a first visit', () => {
    expect(store.isReleaseNew('0.92.0', null, '0.92.0')).toBe(true);
    expect(store.isReleaseNew('0.91.1', null, '0.92.0')).toBe(false);
    expect(store.isReleaseNew('0.91.0', null, '0.92.0')).toBe(false);
  });
});

describe('openWhatsNew', () => {
  it('returns the value from before, records the current version and tells each subscriber once', () => {
    localStorage.setItem(store.SEEN_KEY, '0.90.0');
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.openWhatsNew()).toBe('0.90.0');
    expect(localStorage.getItem(store.SEEN_KEY)).toBe(APP_VERSION);
    expect(store.readSeen()).toBe(APP_VERSION);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('keeps a higher version already stored', () => {
    localStorage.setItem(store.SEEN_KEY, '9.0.0');
    expect(store.openWhatsNew()).toBe('9.0.0');
    expect(localStorage.getItem(store.SEEN_KEY)).toBe('9.0.0');
  });

  it('remembers the opening in memory when the write throws, until the page reloads', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => store.openWhatsNew()).not.toThrow();
    expect(store.readSeen()).toBe(APP_VERSION);
    expect(store.isUnseen(store.readSeen())).toBe(false);

    store = await load();
    expect(store.readSeen()).toBeNull();
  });

  it('works with storage that throws on every access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(store.openWhatsNew()).toBeNull();
    expect(store.readSeen()).toBe(APP_VERSION);
  });
});

describe('subscribe', () => {
  it('hears another tab write the key, or clear storage, and nothing else', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    window.dispatchEvent(new StorageEvent('storage', { key: store.SEEN_KEY }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new StorageEvent('storage', { key: 'gt:instructor:dismissed-alerts' }));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new StorageEvent('storage', { key: store.SEEN_KEY }));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

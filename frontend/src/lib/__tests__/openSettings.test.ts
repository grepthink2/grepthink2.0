import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPEN_SETTINGS_EVENT, openSettings, type SettingsSection } from '../openSettings';

describe('openSettings', () => {
  const heard = vi.fn();
  const listen = (event: Event) => heard((event as CustomEvent<{ section: SettingsSection }>).detail.section);

  afterEach(() => {
    window.removeEventListener(OPEN_SETTINGS_EVENT, listen);
    heard.mockClear();
  });

  it('asks the shell for Settings on a section, Profile unless another is named', () => {
    window.addEventListener(OPEN_SETTINGS_EVENT, listen);
    openSettings();
    openSettings('email');
    openSettings('apps');
    expect(OPEN_SETTINGS_EVENT).toBe('gt:open-settings');
    expect(heard.mock.calls).toEqual([['profile'], ['email'], ['apps']]);
  });
});

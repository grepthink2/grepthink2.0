import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPEN_CLASS_SELECTOR_EVENT, openClassSelector } from '../openClassSelector';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('openClassSelector', () => {
  it('dispatches the open-class-selector event on window', () => {
    const dispatch = vi.spyOn(window, 'dispatchEvent');
    const heard = vi.fn();
    window.addEventListener(OPEN_CLASS_SELECTOR_EVENT, heard);
    openClassSelector();
    window.removeEventListener(OPEN_CLASS_SELECTOR_EVENT, heard);

    expect(OPEN_CLASS_SELECTOR_EVENT).toBe('gt:open-class-selector');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0][0] as Event).type).toBe(OPEN_CLASS_SELECTOR_EVENT);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});

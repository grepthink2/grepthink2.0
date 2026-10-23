import { describe, expect, it, vi } from 'vitest';
import { onCalendarEscape } from '../calendarEscape';

const esc = (init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, ...init });
  document.body.dispatchEvent(event);
  return event;
};

describe('onCalendarEscape', () => {
  it('gives Esc to the calendar opened last, and to nothing behind it', () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind, true);
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = onCalendarEscape(first);
    const offSecond = onCalendarEscape(second);

    const event = esc();
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(behind).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);

    offSecond();
    esc();
    expect(first).toHaveBeenCalledTimes(1);
    offFirst();
    esc();
    expect(behind).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', behind, true);
  });

  it('leaves other keys and an Esc that ends an IME composition alone', () => {
    const close = vi.fn();
    const off = onCalendarEscape(close);
    esc({ isComposing: true });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(close).not.toHaveBeenCalled();
    off();
  });

  it('can be released twice', () => {
    const close = vi.fn();
    const off = onCalendarEscape(close);
    off();
    off();
    esc();
    expect(close).not.toHaveBeenCalled();
  });
});

import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRovingFocus, type RovingOptions } from '../useRovingFocus';

const NAMES = ['One', 'Two', 'Three', 'Four'];

interface RowProps extends Partial<Pick<RovingOptions, 'orientation' | 'loop' | 'onMove'>> {
  /** The item that starts selected, -1 for none. */
  initial?: number;
  disabled?: number[];
  /** Select the item a key lands on, as a radio group does. @default true */
  selectOnMove?: boolean;
}

/** Four buttons on the hook, then a button after the group. */
function Row({ initial = 0, disabled = [], selectOnMove = true, orientation, loop, onMove }: RowProps) {
  const [active, setActive] = useState(initial);
  const { getItemProps } = useRovingFocus({
    count: NAMES.length,
    activeIndex: active,
    orientation,
    loop,
    isDisabled: (i) => disabled.includes(i),
    onMove: (i) => {
      onMove?.(i);
      if (selectOnMove) setActive(i);
    },
  });
  return (
    <div>
      {NAMES.map((name, i) => (
        <button key={name} type="button" disabled={disabled.includes(i)} onClick={() => setActive(i)} {...getItemProps(i)}>
          {name}
        </button>
      ))}
      <button type="button">After</button>
    </div>
  );
}

const item = (name: string) => screen.getByRole('button', { name });
const tabIndexes = () => NAMES.map((name) => item(name).getAttribute('tabindex'));

describe('useRovingFocus', () => {
  it('only the active item is tabbable', async () => {
    render(<Row initial={2} />);
    expect(tabIndexes()).toEqual(['-1', '-1', '0', '-1']);
    await userEvent.tab();
    expect(item('Three')).toHaveFocus();
    await userEvent.tab();
    expect(item('After')).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(item('Three')).toHaveFocus();
  });

  it('gives the tab stop to the first enabled item when none is active, or the active one is disabled', () => {
    const { unmount } = render(<Row initial={-1} disabled={[0]} />);
    expect(tabIndexes()).toEqual(['-1', '0', '-1', '-1']);
    unmount();
    render(<Row initial={2} disabled={[0, 2]} />);
    expect(tabIndexes()).toEqual(['-1', '0', '-1', '-1']);
  });

  it('ArrowRight skips a disabled item and wraps', async () => {
    const onMove = vi.fn();
    render(<Row disabled={[1]} onMove={onMove} />);
    await userEvent.tab();
    expect(item('One')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Three')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Four')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(item('One')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(item('Four')).toHaveFocus();
    expect(onMove.mock.calls.map(([i]) => i)).toEqual([2, 3, 0, 3]);
    // The tab stop follows the selection the moves made.
    expect(tabIndexes()).toEqual(['-1', '-1', '-1', '0']);
  });

  it('Home and End', async () => {
    const onMove = vi.fn();
    render(<Row initial={1} disabled={[3]} onMove={onMove} />);
    await userEvent.tab();
    expect(item('Two')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(item('Three')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(item('One')).toHaveFocus();
    expect(onMove.mock.calls.map(([i]) => i)).toEqual([2, 0]);
  });

  it('vertical orientation ignores ArrowRight', async () => {
    const onMove = vi.fn();
    render(<Row orientation="vertical" onMove={onMove} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(item('One')).toHaveFocus();
    expect(onMove).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowDown}');
    expect(item('Two')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(item('One')).toHaveFocus();
  });

  it('horizontal, the default, ignores ArrowDown; both takes all four arrows', async () => {
    const onMove = vi.fn();
    const { unmount } = render(<Row onMove={onMove} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    expect(item('One')).toHaveFocus();
    expect(onMove).not.toHaveBeenCalled();
    unmount();

    render(<Row orientation="both" />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    expect(item('Two')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Three')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(item('Two')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(item('One')).toHaveFocus();
  });

  it('stops at the ends without loop', async () => {
    render(<Row loop={false} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowLeft}');
    expect(item('One')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(item('Four')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Four')).toHaveFocus();
  });

  it('focuses the item before calling onMove, and keeps the arrow from scrolling the page', () => {
    const focusedOnMove: (string | null)[] = [];
    render(<Row onMove={() => focusedOnMove.push(document.activeElement?.textContent ?? null)} />);
    item('One').focus();
    // fireEvent returns false once a handler called preventDefault.
    expect(fireEvent.keyDown(item('One'), { key: 'ArrowRight' })).toBe(false);
    expect(focusedOnMove).toEqual(['Two']);
  });

  it('a key that lands on the focused item calls no onMove, and still keeps the page still', () => {
    const onMove = vi.fn();
    render(<Row onMove={onMove} />);
    item('One').focus();
    expect(fireEvent.keyDown(item('One'), { key: 'Home' })).toBe(false);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('leaves modified arrows, and every other key, to the browser', () => {
    const onMove = vi.fn();
    render(<Row onMove={onMove} />);
    item('One').focus();
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(fireEvent.keyDown(item('One'), { key: 'ArrowRight', [modifier]: true })).toBe(true);
    }
    expect(fireEvent.keyDown(item('One'), { key: 'a' })).toBe(true);
    expect(fireEvent.keyDown(item('One'), { key: 'PageDown' })).toBe(true);
    expect(onMove).not.toHaveBeenCalled();
    expect(item('One')).toHaveFocus();
  });

  it('moves focus without selecting when onMove leaves the selection alone (manual tabs)', async () => {
    render(<Row selectOnMove={false} />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(item('Two')).toHaveFocus();
    // The tab stop stays on the selected item until something selects another.
    expect(tabIndexes()).toEqual(['0', '-1', '-1', '-1']);
  });
});

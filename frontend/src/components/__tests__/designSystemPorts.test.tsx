import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tag } from 'lucide-react';
import { cssRules } from '@/test/cssRules';
import { Popover } from '../Popover/Popover';
import { Menu, MenuItem } from '../Menu/Menu';
import { Tooltip } from '../Tooltip/Tooltip';

describe('Popover', () => {
  it('renders its surface only while open', () => {
    const { rerender } = render(<Popover anchor={<button>Open</button>}>Body</Popover>);
    expect(screen.queryByText('Body')).toBeNull();
    rerender(<Popover open anchor={<button>Open</button>}>Body</Popover>);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });

  it('closes on Esc without letting the key reach a modal listening behind it', () => {
    const modalEsc = vi.fn();
    document.addEventListener('keydown', modalEsc);   // registered first, like a modal
    const onClose = vi.fn();
    render(<Popover open onClose={onClose} anchor={<button>Open</button>}>Body</Popover>);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(modalEsc).not.toHaveBeenCalled();
    document.removeEventListener('keydown', modalEsc);
  });

  it('closes on a click outside, not on one inside', () => {
    const onClose = vi.fn();
    render(
      <div>
        <p>Elsewhere</p>
        <Popover open onClose={onClose} anchor={<button>Open</button>}><span>Inside</span></Popover>
      </div>,
    );
    fireEvent.mouseDown(screen.getByText('Inside'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByText('Elsewhere'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('Menu', () => {
  it('focuses the first item and moves with the arrow keys, wrapping', async () => {
    render(
      <Menu ariaLabel="Actions" autoFocus>
        <MenuItem>One</MenuItem>
        <MenuItem checked={false}>Two</MenuItem>
      </Menu>,
    );
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemcheckbox', { name: 'Two' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'One' })).toHaveFocus();
  });

  it('exposes checkable rows as menuitemcheckbox with their state', () => {
    render(
      <Menu ariaLabel="Labels">
        <MenuItem checked>backend</MenuItem>
        <MenuItem checked={false}>bug</MenuItem>
      </Menu>,
    );
    expect(screen.getByRole('menuitemcheckbox', { name: 'backend' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'bug' })).toHaveAttribute('aria-checked', 'false');
  });

  it('exposes single-choice rows as menuitemradio with their state, in the arrow-key path', async () => {
    render(
      <Menu ariaLabel="Sprints" autoFocus>
        <MenuItem radio checked={false}>Sprint 1</MenuItem>
        <MenuItem radio checked>Sprint 2</MenuItem>
      </Menu>,
    );
    expect(screen.getByRole('menuitemradio', { name: 'Sprint 1' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('menuitemradio', { name: 'Sprint 2' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('menuitemradio', { name: 'Sprint 1' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'Sprint 2' })).toHaveFocus();
  });

  it('opens on the checked row with autoFocus="checked"', () => {
    render(
      <Menu ariaLabel="Sprints" autoFocus="checked">
        <MenuItem radio checked={false}>Sprint 1</MenuItem>
        <MenuItem radio checked>Sprint 2</MenuItem>
        <MenuItem radio checked={false}>Sprint 3</MenuItem>
      </Menu>,
    );
    expect(screen.getByRole('menuitemradio', { name: 'Sprint 2' })).toHaveFocus();
  });

  it('marks a checkable row without an icon in a check slot, so its state is not colour alone', () => {
    render(
      <Menu ariaLabel="Labels">
        <MenuItem checked>backend</MenuItem>
        <MenuItem checked={false}>bug</MenuItem>
        <MenuItem checked icon={<Tag size={16} aria-hidden="true" />}>design</MenuItem>
        <MenuItem>Rename</MenuItem>
      </Menu>,
    );
    const slotOf = (row: HTMLElement) => row.querySelector('.gt-menu__check');
    const checked = screen.getByRole('menuitemcheckbox', { name: 'backend' });
    expect(slotOf(checked)?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // An unchecked row keeps the empty slot, so the labels stay aligned.
    expect(slotOf(screen.getByRole('menuitemcheckbox', { name: 'bug' }))).toBeEmptyDOMElement();
    // A row with an icon shows its state on the icon, and an action row has no state.
    expect(slotOf(screen.getByRole('menuitemcheckbox', { name: 'design' }))).toBeNull();
    expect(slotOf(screen.getByRole('menuitem', { name: 'Rename' }))).toBeNull();
  });

  it('gives each row 44px on phones', () => {
    render(<Menu ariaLabel="Actions"><MenuItem>One</MenuItem></Menu>);
    const [phone] = cssRules('.gt-menu__item', 'max-width: 767px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
  });

  it('opens on the first item with autoFocus="checked" when no row is checked', () => {
    render(
      <Menu ariaLabel="Sprints" autoFocus="checked">
        <MenuItem radio checked={false}>Sprint 1</MenuItem>
        <MenuItem radio checked={false}>Sprint 2</MenuItem>
      </Menu>,
    );
    expect(screen.getByRole('menuitemradio', { name: 'Sprint 1' })).toHaveFocus();
  });
});

describe('Tooltip', () => {
  it('describes its trigger with the bubble text', () => {
    render(<Tooltip content="Reporter: Tony Wu"><span>TW</span></Tooltip>);
    const bubble = screen.getByRole('tooltip');
    expect(bubble).toHaveTextContent('Reporter: Tony Wu');
    expect(screen.getByText('TW').parentElement).toHaveAttribute('aria-describedby', bubble.id);
  });

  it('leaves the tab order alone when told the trigger sits inside another control', () => {
    render(<Tooltip content="x" focusable={false}><span>TW</span></Tooltip>);
    expect(screen.getByText('TW').parentElement).not.toHaveAttribute('tabindex');
  });

  it('shows the bubble while anything inside the tooltip has keyboard focus', () => {
    render(<Tooltip content="x"><span>TW</span></Tooltip>);
    const [shown] = cssRules('.gt-tooltip:has(:focus-visible) .gt-tooltip__bubble');
    expect(shown.getPropertyValue('opacity')).toBe('1');
  });

  describe('Esc', () => {
    // A dialog behind the tooltip, closing on an Esc that reaches the document.
    const modalEsc = vi.fn();
    const onDocumentKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') modalEsc();
    };
    beforeEach(() => {
      modalEsc.mockClear();
      document.addEventListener('keydown', onDocumentKey);
    });
    afterEach(() => {
      document.removeEventListener('keydown', onDocumentKey);
    });
    const tooltipOf = (text: string) => screen.getByText(text).closest('.gt-tooltip');

    it('hides a bubble shown by keyboard focus without closing the popover around it', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      render(
        <Popover open onClose={onClose} anchor={<button>Open</button>}>
          <Tooltip content="Due Friday"><span>GT-12</span></Tooltip>
        </Popover>,
      );
      await user.tab();
      await user.tab();
      expect(screen.getByText('GT-12').parentElement).toHaveFocus();

      await user.keyboard('{Escape}');
      expect(tooltipOf('GT-12')).toHaveClass('gt-tooltip--dismissed');
      expect(onClose).not.toHaveBeenCalled();
      expect(modalEsc).not.toHaveBeenCalled();

      // With the bubble gone, the next Esc closes the popover.
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('hides a hovered bubble, which comes back on the next hover', async () => {
      const user = userEvent.setup();
      render(<Tooltip content="Reporter: Tony Wu"><span>TW</span></Tooltip>);
      await user.hover(screen.getByText('TW'));
      await user.keyboard('{Escape}');
      expect(tooltipOf('TW')).toHaveClass('gt-tooltip--dismissed');
      expect(modalEsc).not.toHaveBeenCalled();

      await user.unhover(screen.getByText('TW'));
      expect(tooltipOf('TW')).toHaveClass('gt-tooltip--dismissed');
      await user.hover(screen.getByText('TW'));
      expect(tooltipOf('TW')).not.toHaveClass('gt-tooltip--dismissed');
    });

    it('comes back on the next keyboard focus', async () => {
      const user = userEvent.setup();
      render(<><button>Before</button><Tooltip content="x"><span>TW</span></Tooltip></>);
      await user.tab();
      await user.tab();
      await user.keyboard('{Escape}');
      expect(tooltipOf('TW')).toHaveClass('gt-tooltip--dismissed');
      await user.tab({ shift: true });
      await user.tab();
      expect(tooltipOf('TW')).not.toHaveClass('gt-tooltip--dismissed');
    });

    it('leaves the key alone when no bubble is showing', async () => {
      const user = userEvent.setup();
      render(<><button>Elsewhere</button><Tooltip content="x"><span>TW</span></Tooltip></>);
      await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
      await user.keyboard('{Escape}');
      expect(modalEsc).toHaveBeenCalledTimes(1);

      // A click on the trigger hides its bubble, and the focus it brings shows none.
      const trigger = screen.getByText('TW').parentElement!;
      await user.click(trigger);
      expect(tooltipOf('TW')).toHaveClass('gt-tooltip--dismissed');
      await user.unhover(trigger);
      expect(trigger).toHaveFocus();
      await user.keyboard('{Escape}');
      expect(modalEsc).toHaveBeenCalledTimes(2);
    });

    it('hides the bubble when its control is activated from the keyboard', async () => {
      const user = userEvent.setup();
      render(<Tooltip content="x"><span>TW</span></Tooltip>);
      await user.tab();
      expect(tooltipOf('TW')).not.toHaveClass('gt-tooltip--dismissed');
      await user.keyboard('{Enter}');
      expect(tooltipOf('TW')).toHaveClass('gt-tooltip--dismissed');
      expect(modalEsc).not.toHaveBeenCalled();
    });

    it('keeps the bubble for a touch press: a tap is how a phone shows it', () => {
      render(<Tooltip content="x"><span>TW</span></Tooltip>);
      fireEvent.pointerDown(screen.getByText('TW'), { pointerType: 'touch' });
      expect(tooltipOf('TW')).not.toHaveClass('gt-tooltip--dismissed');
      fireEvent.pointerDown(screen.getByText('TW'), { pointerType: 'mouse' });
      expect(tooltipOf('TW')).toHaveClass('gt-tooltip--dismissed');
    });

    it('hides the bubble a key turned on for a trigger focused without the keyboard', async () => {
      const user = userEvent.setup();
      render(<><button>Elsewhere</button><Tooltip content="x"><span>TW</span></Tooltip></>);
      // Focus that follows a click, as when a dialog places it: no bubble yet.
      await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
      act(() => screen.getByText('TW').parentElement!.focus());

      // The first Esc finds no bubble and is the dialog's; pressing a key on a focused element is
      // what turns :focus-visible on, so the bubble is up from then on.
      await user.keyboard('{Escape}');
      expect(modalEsc).toHaveBeenCalledTimes(1);
      expect(tooltipOf('TW')).not.toHaveClass('gt-tooltip--dismissed');
      await user.keyboard('{Escape}');
      expect(tooltipOf('TW')).toHaveClass('gt-tooltip--dismissed');
      expect(modalEsc).toHaveBeenCalledTimes(1);
    });

    it('leaves an Esc that ends text composition alone', async () => {
      const user = userEvent.setup();
      render(<Tooltip content="x"><span>TW</span></Tooltip>);
      await user.hover(screen.getByText('TW'));
      fireEvent.keyDown(document.body, { key: 'Escape', isComposing: true });
      expect(modalEsc).toHaveBeenCalledTimes(1);
      expect(tooltipOf('TW')).not.toHaveClass('gt-tooltip--dismissed');
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
});

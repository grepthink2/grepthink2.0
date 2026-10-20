import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Eye, MoreHorizontal, X } from 'lucide-react';
import { cssRules } from '@/test/cssRules';
import { Menu, MenuItem } from '@/components/Menu/Menu';
import { Popover } from '@/components/Popover/Popover';
import { IconButton } from '../IconButton';

describe('IconButton', () => {
  it('is named by ariaLabel, not by its icon', () => {
    render(<IconButton ariaLabel="Close"><X /></IconButton>);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('aria-label', 'Close');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('defaults to ghost md type button', () => {
    render(<IconButton ariaLabel="Close"><X /></IconButton>);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveClass('gt-icon-button', 'gt-icon-button--ghost', 'gt-icon-button--md');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).not.toHaveAttribute('aria-pressed');
    expect(button).toBeEnabled();
  });

  it('applies variant, size and className, and passes native props and ref through', async () => {
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      <IconButton ariaLabel="Delete task" variant="danger" size="sm" className="x" ref={ref} onClick={onClick} data-focus-key="del">
        <X />
      </IconButton>,
    );
    const button = screen.getByRole('button', { name: 'Delete task' });
    expect(button).toHaveClass('gt-icon-button', 'gt-icon-button--danger', 'gt-icon-button--sm', 'x');
    expect(ref.current).toBe(button);
    expect(button).toHaveAttribute('data-focus-key', 'del');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('exposes pressed', () => {
    const { rerender } = render(<IconButton ariaLabel="Bold" variant="solid" size="lg" pressed><X /></IconButton>);
    const button = screen.getByRole('button', { name: 'Bold' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveClass('gt-icon-button--solid', 'gt-icon-button--lg');
    rerender(<IconButton ariaLabel="Bold" pressed={false}><X /></IconButton>);
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps aria-label and aria-pressed to itself, since ariaLabel and pressed set them', () => {
    // @ts-expect-error: a caller's aria-label would be overwritten by ariaLabel
    const close = <IconButton ariaLabel="Close" aria-label="Shut"><X /></IconButton>;
    // @ts-expect-error: a caller's aria-pressed would be overwritten; a toggle passes `pressed`
    const bold = <IconButton ariaLabel="Bold" aria-pressed><X /></IconButton>;
    render(<>{close}{bold}</>);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bold' })).not.toHaveAttribute('aria-pressed');
  });

  it('shows its label as a tooltip bubble that assistive tech does not hear twice', () => {
    const { container } = render(<IconButton ariaLabel="Close"><X /></IconButton>);
    const tip = container.firstElementChild;
    expect(tip).toHaveClass('gt-icon-tip', 'gt-tooltip');
    const bubble = tip?.querySelector('.gt-tooltip__bubble');
    expect(bubble).toHaveTextContent('Close');
    expect(bubble).toHaveClass('gt-tooltip__bubble--top');
    expect(bubble).toHaveAttribute('aria-hidden', 'true');
    // The label is already the name: no tooltip role, and no description repeating it.
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).not.toHaveAccessibleDescription();
  });

  it('shows other text, on another side, or no tooltip at all, as asked', () => {
    const { container, rerender } = render(
      <IconButton ariaLabel="Show password" tooltip="Hide password" tooltipSide="bottom"><Eye /></IconButton>,
    );
    const bubble = container.querySelector('.gt-tooltip__bubble');
    expect(bubble).toHaveTextContent('Hide password');
    expect(bubble).toHaveClass('gt-tooltip__bubble--bottom');

    rerender(<IconButton ariaLabel="Close" tooltip={false}><X /></IconButton>);
    expect(container.querySelector('.gt-tooltip')).toBeNull();
    expect(container.firstElementChild).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('shows no tooltip while disabled', () => {
    const { container } = render(<IconButton ariaLabel="Close" disabled><X /></IconButton>);
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(container.querySelector('.gt-tooltip__bubble')).toBeNull();
  });

  it('keeps the same button while it turns disabled and back', () => {
    const { container, rerender } = render(<IconButton ariaLabel="Close"><X /></IconButton>);
    const button = screen.getByRole('button', { name: 'Close' });

    rerender(<IconButton ariaLabel="Close" disabled><X /></IconButton>);
    expect(screen.getByRole('button', { name: 'Close' })).toBe(button);
    expect(container.querySelector('.gt-tooltip__bubble')).toBeNull();

    rerender(<IconButton ariaLabel="Close"><X /></IconButton>);
    expect(screen.getByRole('button', { name: 'Close' })).toBe(button);
    expect(container.querySelector('.gt-tooltip__bubble')).toHaveTextContent('Close');
  });

  it('hides its label on Esc without closing the dialog around it', async () => {
    const user = userEvent.setup();
    const dialogEsc = vi.fn();
    const onDocumentKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dialogEsc();
    };
    document.addEventListener('keydown', onDocumentKey);
    const { container } = render(<IconButton ariaLabel="Close"><X /></IconButton>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(container.firstElementChild).toHaveClass('gt-tooltip--dismissed');
    expect(dialogEsc).not.toHaveBeenCalled();

    // With the label hidden, the next Esc is the dialog's.
    await user.keyboard('{Escape}');
    expect(dialogEsc).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', onDocumentKey);
  });

  it('hides its label once pressed, so the first Esc closes the menu it opened', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function MoreActions() {
      const [open, setOpen] = useState(false);
      return (
        <Popover
          open={open}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          padded={false}
          anchor={(
            <IconButton ariaLabel="More actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <MoreHorizontal />
            </IconButton>
          )}
        >
          <Menu ariaLabel="Project actions"><MenuItem>Rename</MenuItem></Menu>
        </Popover>
      );
    }
    const { container } = render(<MoreActions />);

    await user.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu', { name: 'Project actions' })).toBeInTheDocument();
    // The pointer still rests on the button, but its label went with the press.
    expect(container.querySelector('.gt-icon-tip')).toHaveClass('gt-tooltip--dismissed');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('hides its label when pressed with Space', async () => {
    const user = userEvent.setup();
    const { container } = render(<IconButton ariaLabel="Bold" pressed={false}><X /></IconButton>);
    await user.tab();
    expect(container.firstElementChild).not.toHaveClass('gt-tooltip--dismissed');
    await user.keyboard(' ');
    expect(container.firstElementChild).toHaveClass('gt-tooltip--dismissed');
  });

  it('is at least 44px square on phones', () => {
    render(<IconButton ariaLabel="Close"><X /></IconButton>);
    const [phone] = cssRules('.gt-icon-button', 'max-width: 767px');
    expect(phone.getPropertyValue('min-width')).toBe('44px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
  });
});

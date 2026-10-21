import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Button } from '@/components/Button/Button';
import { Drawer } from '../Drawer';

afterEach(() => {
  vi.useRealTimers();
});

describe('Drawer', () => {
  it('is a modal dialog in <body>, named by its title and described by its subtitle', () => {
    render(
      <Drawer open onClose={() => {}} title="Edit assignment" subtitle="TSR 4 · due Oct 24">
        <input aria-label="Title" />
      </Drawer>,
    );
    const drawer = screen.getByRole('dialog', { name: 'Edit assignment' });
    expect(drawer.tagName).toBe('ASIDE');
    expect(drawer).toHaveAccessibleDescription('TSR 4 · due Oct 24');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer).toHaveClass('gt-drawer');
    expect(drawer).not.toHaveClass('gt-drawer--left');
    expect(drawer.parentElement).toHaveClass('gt-drawer-backdrop');
    expect(drawer.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByRole('heading', { level: 2, name: 'Edit assignment' })).toHaveClass('gt-drawer__title');
    // useDialog moved focus to the first field.
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
  });

  it('opens from the left with its side class, named by ariaLabel when it has no title', () => {
    render(<Drawer open side="left" width={280} ariaLabel="Main menu"><p>Navigation items</p></Drawer>);
    const drawer = screen.getByRole('dialog', { name: 'Main menu' });
    expect(drawer).toHaveClass('gt-drawer', 'gt-drawer--left');
    expect(drawer.parentElement).toHaveClass('gt-drawer-backdrop--left');
    expect(drawer.style.width).toBe('280px');
    expect(drawer).not.toHaveAttribute('aria-labelledby');
  });

  it('takes a CSS width, and the 420px default from its stylesheet', () => {
    const { rerender } = render(<Drawer open title="Edit" width="32rem" />);
    expect(screen.getByRole('dialog').style.width).toBe('32rem');
    rerender(<Drawer open title="Edit" />);
    expect(screen.getByRole('dialog').style.width).toBe('');
    expect(cssRules('.gt-drawer')[0].getPropertyValue('width')).toBe('420px');
  });

  it('closes on Esc, the scrim and the ×, except while closeDisabled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Drawer open onClose={onClose} title="Edit assignment" />);
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(3);

    onClose.mockClear();
    rerender(<Drawer open onClose={onClose} title="Edit assignment" closeDisabled />);
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pins the footer under a body that scrolls', () => {
    render(
      <Drawer open title="Edit assignment" footer={<><Button variant="outline">Cancel</Button><Button>Save</Button></>}>
        <p>Form</p>
      </Drawer>,
    );
    const footer = screen.getByRole('button', { name: 'Save' }).parentElement as HTMLElement;
    expect(footer).toHaveClass('gt-drawer__footer');
    expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText('Form').parentElement).toHaveClass('gt-drawer__body');
    expect(cssRules('.gt-drawer__footer')[0].getPropertyValue('flex-shrink')).toBe('0');
    expect(cssRules('.gt-drawer__body')[0].getPropertyValue('overflow-y')).toBe('auto');
  });

  it('slides out over 0.2s, then unmounts', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Drawer open title="Edit" />);
    rerender(<Drawer open={false} title="Edit" />);
    expect(screen.getByRole('dialog').parentElement).toHaveClass('gt-drawer-backdrop--closing');
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders in place with portal={false}', () => {
    const { container } = render(<Drawer open portal={false} title="Edit" />);
    expect(container.firstChild).toHaveClass('gt-drawer-backdrop', 'gt-drawer-backdrop--inline');
  });

  it('passes native props, className and ref to the sheet, and keeps its own aria to itself', () => {
    const ref = createRef<HTMLElement>();
    // @ts-expect-error: a caller's aria-label would be overwritten; pass `ariaLabel`
    const labelled = <Drawer open title="Edit" className="x" data-key="d" ref={ref} aria-label="Other" />;
    render(labelled);
    const drawer = screen.getByRole('dialog', { name: 'Edit' });
    expect(ref.current).toBe(drawer);
    expect(drawer).toHaveClass('gt-drawer', 'x');
    expect(drawer).toHaveAttribute('data-key', 'd');
    expect(drawer).not.toHaveAttribute('aria-label');
  });

  it('is full width on phones, and only fades under reduced motion', () => {
    render(<Drawer open title="Edit" />);
    expect(cssRules('.gt-drawer', 'max-width: 767px')[0].getPropertyValue('width')).toBe('100%');
    expect(cssRules('.gt-drawer__footer .gt-button', 'max-width: 767px')[0].getPropertyValue('flex')).toBe('1 1 auto');
    const [sheet] = cssRules('.gt-drawer', 'prefers-reduced-motion');
    expect(sheet.getPropertyValue('animation')).toContain('gt-drawer-fade-in');
  });
});

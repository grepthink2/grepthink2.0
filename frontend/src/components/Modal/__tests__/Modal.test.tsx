import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Button } from '@/components/Button/Button';
import { DatePickerField } from '@/components/DatePickerField/DatePickerField';
import { Modal } from '../Modal';

afterEach(() => {
  vi.useRealTimers();
});

/** The dialog moves focus in a moment after it opens: let that moment pass. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

describe('Modal', () => {
  it('is a dialog on its sheet, in <body>, named by its title and described by its subtitle', () => {
    const { container } = render(
      <Modal open onClose={() => {}} title="Edit project" subtitle="Bike Share Map · Team 4">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Edit project' });
    expect(dialog).toHaveAccessibleDescription('Bike Share Map · Team 4');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('tabindex', '-1');
    expect(dialog).toHaveClass('gt-modal', 'gt-modal--md', 'gt-modal--form');
    expect(dialog.parentElement).toHaveClass('gt-modal-backdrop');
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(container).toBeEmptyDOMElement();
    expect(screen.getByRole('heading', { level: 2, name: 'Edit project' })).toHaveClass('gt-modal__title');
    expect(within(dialog).getByText('Body').parentElement).toHaveClass('gt-modal__body');
  });

  it('renders nothing while closed', () => {
    render(<Modal title="Edit project"><p>Body</p></Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes from the ×, which says Close and is held while closeDisabled', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<Modal open onClose={onClose} title="Edit project" />);
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close).toHaveClass('gt-icon-button', 'gt-modal__close');
    // An absolutely placed ×, so no tooltip wrapper around it.
    expect(close.parentElement).toHaveClass('gt-modal__head');
    await user.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith(); // not with the click event: onClose={setOpen} stays safe

    rerender(<Modal open onClose={onClose} title="Edit project" closeDisabled />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();

    rerender(<Modal open onClose={onClose} title="Edit project" hideClose />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('renders its footer actions and the tabs slot under the title', () => {
    render(
      <Modal
        open
        title="Edit project"
        tabs={<div role="tablist" aria-label="Sections" />}
        footer={<><Button variant="outline">Cancel</Button><Button>Save changes</Button></>}
      />,
    );
    const footer = screen.getByRole('button', { name: 'Save changes' }).parentElement;
    expect(footer).toHaveClass('gt-modal__footer');
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const tabs = screen.getByRole('tablist', { name: 'Sections' }).parentElement;
    expect(tabs).toHaveClass('gt-modal__tabs');
    expect(tabs?.parentElement).toHaveClass('gt-modal__head');
  });

  it('applies its size, the message header and the legacy width', () => {
    const { rerender } = render(<Modal open size="lg" title="Edit project" />);
    expect(screen.getByRole('dialog')).toHaveClass('gt-modal--lg');
    rerender(<Modal open size="sm" variant="message" title="Join a class" width={480} style={{ color: 'red' }} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('gt-modal--sm', 'gt-modal--message');
    expect(dialog.style.maxWidth).toBe('480px');
    expect(dialog.style.color).toBe('red');
  });

  it('focuses the first field in the body', async () => {
    render(
      <Modal open title="Join a class" footer={<Button>Join</Button>}>
        <label>Class code <input /></label>
      </Modal>,
    );
    await settle();
    expect(screen.getByRole('textbox', { name: 'Class code' })).toHaveFocus();
  });

  it('stays mounted with --closing for the exit, then unmounts', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Modal open title="Edit project" />);
    rerender(<Modal open={false} title="Edit project" />);
    expect(screen.getByRole('dialog').parentElement).toHaveClass('gt-modal-backdrop--closing');
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('takes its name from ariaLabel when it has no title, and alertdialog as its role', () => {
    const { rerender } = render(<Modal open ariaLabel="Preview" />);
    expect(screen.getByRole('dialog', { name: 'Preview' })).not.toHaveAttribute('aria-labelledby');
    rerender(<Modal open ariaLabel="Preview" title="Delete project?" role="alertdialog" />);
    expect(screen.getByRole('alertdialog', { name: 'Delete project?' })).not.toHaveAttribute('aria-label');
  });

  it('renders in place with portal={false}, on the inline scrim', () => {
    const { container } = render(<Modal open portal={false} title="Edit project" />);
    expect(container.firstChild).toHaveClass('gt-modal-backdrop', 'gt-modal-backdrop--inline');
    expect(within(container).getByRole('dialog', { name: 'Edit project' })).toBeInTheDocument();
  });

  it('passes native props, className and ref to the sheet, and adds a caller’s description to the subtitle', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <>
        <p id="extra">Unsaved changes are lost.</p>
        <Modal open title="Leave" subtitle="Team 4" className="x" data-key="m" aria-describedby="extra" ref={ref} />
      </>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Leave' });
    expect(ref.current).toBe(dialog);
    expect(dialog).toHaveClass('gt-modal', 'x');
    expect(dialog).toHaveAttribute('data-key', 'm');
    expect(dialog).toHaveAccessibleDescription('Team 4 Unsaved changes are lost.');
  });

  it('keeps aria-modal, aria-labelledby and aria-label to itself', () => {
    // @ts-expect-error: a caller's aria-modal would be overwritten; the sheet is always modal
    const modal = <Modal open title="One" aria-modal={false} />;
    // @ts-expect-error: a caller's aria-labelledby would be overwritten; the title names it
    const labelled = <Modal open title="Two" aria-labelledby="elsewhere" />;
    // @ts-expect-error: a caller's aria-label would be overwritten; pass `ariaLabel`
    const label = <Modal open aria-label="Three" />;
    render(<>{modal}{labelled}{label}</>);
    const [one, two, three] = screen.getAllByRole('dialog');
    expect(one).toHaveAttribute('aria-modal', 'true');
    expect(two).toHaveAccessibleName('Two');
    expect(three).not.toHaveAttribute('aria-label');
  });

  it('with the date picker’s calendar open inside, Esc, Tab and a press stay with the calendar', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function WithDate() {
      const [value, setValue] = useState('2026-10-20 09:00');
      return (
        <Modal open onClose={onClose} title="New meeting">
          <DatePickerField label="Starts" value={value} onChange={setValue} showTime />
        </Modal>
      );
    }
    render(<WithDate />);
    await user.click(screen.getByRole('button', { name: /^Starts/ }));
    const calendar = screen.getByRole('dialog', { name: 'Choose date' });

    // Tab stays in the calendar, which is portaled out of the sheet.
    const done = within(calendar).getByRole('button', { name: 'Done' });
    done.focus();
    await user.tab();
    expect(within(calendar).getByRole('button', { name: 'Previous month' })).toHaveFocus();

    // A press on it leaves the modal open.
    fireEvent.mouseDown(within(calendar).getByRole('button', { name: 'Next month' }));
    expect(onClose).not.toHaveBeenCalled();

    // Esc closes the calendar alone and gives focus back to its trigger.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Choose date' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Starts/ })).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives focus back to the button that opened it', async () => {
    const user = userEvent.setup();
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Edit</Button>
          <Modal open={open} onClose={() => setOpen(false)} title="Edit project"><input aria-label="Name" /></Modal>
        </>
      );
    }
    render(<Page />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sits on --gt-z-modal and pins its header and footer around a body that scrolls', () => {
    render(<Modal open title="Edit project" />);
    const [scrim] = cssRules('.gt-modal-backdrop');
    expect(scrim.getPropertyValue('z-index')).toBe('var(--gt-z-modal)');
    expect(scrim.getPropertyValue('position')).toBe('fixed');
    const [sheet] = cssRules('.gt-modal');
    expect(sheet.getPropertyValue('max-height')).toBe('88vh');
    const [body] = cssRules('.gt-modal__body');
    expect(body.getPropertyValue('overflow-y')).toBe('auto');
    expect(cssRules('.gt-modal__head')[0].getPropertyValue('flex-shrink')).toBe('0');
    expect(cssRules('.gt-modal__footer')[0].getPropertyValue('flex-shrink')).toBe('0');
    expect(cssRules('.gt-modal--sm')[0].getPropertyValue('max-width')).toBe('400px');
    expect(cssRules('.gt-modal--md')[0].getPropertyValue('max-width')).toBe('560px');
    expect(cssRules('.gt-modal--lg')[0].getPropertyValue('max-width')).toBe('760px');
  });

  it('keeps 12px margins on phones and stretches the footer buttons; under reduced motion the exit is instant', () => {
    render(<Modal open title="Edit project" />);
    const [scrim] = cssRules('.gt-modal-backdrop', 'max-width: 767px');
    expect(scrim.getPropertyValue('padding')).toBe('12px');
    const [buttons] = cssRules('.gt-modal__footer .gt-button', 'max-width: 767px');
    expect(buttons.getPropertyValue('flex')).toBe('1 1 auto');
    const [closing] = cssRules('.gt-modal-backdrop--closing', 'prefers-reduced-motion');
    expect(closing.getPropertyValue('opacity')).toBe('0');
  });
});

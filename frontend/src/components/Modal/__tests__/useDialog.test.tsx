import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popover } from '@/components/Popover/Popover';
import { Tooltip } from '@/components/Tooltip/Tooltip';
import { useDialog } from '../useDialog';
import { isTopDialog, popDialog, pushDialog } from '../dialogStack';
import { lockBodyScroll } from '../scrollLock';

interface TestDialogProps {
  open: boolean;
  onClose?: () => void;
  closeDisabled?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  inPlace?: boolean;
  label?: string;
  children?: ReactNode;
}

/** A bare sheet on the hook, the way Modal, Drawer and ConfirmDialog use it. */
function TestDialog({ open, onClose, closeDisabled, initialFocusRef, inPlace = false, label = 'Dialog', children }: TestDialogProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const { mounted, closing, onScrimDown } = useDialog({ open, onClose, closeDisabled, initialFocusRef, sheetRef, inPlace });
  if (!mounted) return null;
  const dialog = (
    <div data-testid={`${label} scrim`} data-closing={closing || undefined} onMouseDown={onScrimDown}>
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>
  );
  return inPlace ? dialog : createPortal(dialog, document.body);
}

/** An opener button and the dialog it opens, the way a page holds one. */
function Opener({ children, onClose }: { children?: ReactNode; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <TestDialog
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
      >
        {children}
      </TestDialog>
    </>
  );
}

afterEach(() => {
  vi.useRealTimers();
  document.body.style.overflow = '';
});

describe('useDialog', () => {
  it('moves focus to the first field on open and back to the opener on close', async () => {
    const user = userEvent.setup();
    render(
      <Opener>
        <button type="button">Help</button>
        <input aria-label="Name" />
      </Opener>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('prefers initialFocusRef, then [data-autofocus], over the first field', () => {
    function WithRef() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <TestDialog open initialFocusRef={ref}>
          <input aria-label="Name" />
          <button type="button" data-autofocus>Marked</button>
          <button type="button" ref={ref}>Chosen</button>
        </TestDialog>
      );
    }
    const { unmount } = render(<WithRef />);
    expect(screen.getByRole('button', { name: 'Chosen' })).toHaveFocus();
    unmount();

    render(
      <TestDialog open>
        <input aria-label="Name" />
        <button type="button" data-autofocus>Marked</button>
      </TestDialog>,
    );
    expect(screen.getByRole('button', { name: 'Marked' })).toHaveFocus();
  });

  it('keeps the focus a field took as it mounted, and still gives focus back to the opener', async () => {
    const user = userEvent.setup();
    render(
      <Opener>
        <input aria-label="Title" />
        <input aria-label="Code" autoFocus />
      </Opener>,
    );
    await user.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('textbox', { name: 'Code' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
  });

  it('focuses the sheet when it holds no field, and skips a field in a hidden panel', () => {
    const { unmount } = render(
      <TestDialog open label="Notes">
        <p>Read only.</p>
        <button type="button">OK</button>
      </TestDialog>,
    );
    expect(screen.getByRole('dialog', { name: 'Notes' })).toHaveFocus();
    unmount();

    render(
      <TestDialog open>
        <div hidden><input aria-label="Hidden tab" /></div>
        <input type="file" aria-label="Logo" style={{ display: 'none' }} />
        <select aria-label="Role"><option>Member</option></select>
      </TestDialog>,
    );
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveFocus();
  });

  it('falls past an initialFocusRef that cannot take focus', () => {
    function WithStaticRef() {
      const ref = useRef<HTMLParagraphElement>(null);
      return (
        <TestDialog open initialFocusRef={ref}>
          <p ref={ref}>Not focusable</p>
          <input aria-label="Name" />
        </TestDialog>
      );
    }
    render(<WithStaticRef />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('traps Tab and Shift+Tab inside the sheet', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Page</button>
        <TestDialog open>
          <button type="button">First</button>
          <input aria-label="Name" />
          <button type="button" disabled>Off</button>
          <button type="button">Last</button>
        </TestDialog>
      </>,
    );
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });

    last.focus();
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    // In the middle, Tab is the browser's.
    await user.tab({ shift: true });
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('wraps Shift+Tab from the sheet itself, and brings a Tab from the page body back in', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Page</button>
        <TestDialog open label="Notes">
          <p>Read only.</p>
          <button type="button">First</button>
          <button type="button">Last</button>
        </TestDialog>
        <button type="button">Page end</button>
      </>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Notes' });
    sheet.focus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();

    // Focus lost to the page (its element went away): the next Tab or Shift+Tab lands back in the
    // sheet, not on the page's own buttons before and after it.
    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('keeps Tab on the sheet when it has nothing to tab to', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Page</button>
        <TestDialog open label="Notes"><p>Read only.</p></TestDialog>
      </>,
    );
    await user.tab();
    expect(screen.getByRole('dialog', { name: 'Notes' })).toHaveFocus();
  });

  it('uses checkVisibility where the browser has it', async () => {
    const user = userEvent.setup();
    // jsdom has no checkVisibility: this one says a collapsed button is not drawn.
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'checkVisibility');
    Object.defineProperty(HTMLElement.prototype, 'checkVisibility', {
      configurable: true,
      writable: true,
      value(this: HTMLElement) {
        return this.textContent !== 'Collapsed';
      },
    });
    try {
      render(
        <TestDialog open>
          <button type="button">First</button>
          <button type="button">Last</button>
          <button type="button">Collapsed</button>
        </TestDialog>,
      );
      screen.getByRole('button', { name: 'Last' }).focus();
      await user.tab();
      expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, 'checkVisibility', original);
      else Reflect.deleteProperty(HTMLElement.prototype, 'checkVisibility');
    }
  });

  it('does not trap Tab from a portaled layer opened inside the dialog', async () => {
    const user = userEvent.setup();
    function WithLayer() {
      const [layer, setLayer] = useState(false);
      return (
        <TestDialog open>
          <button type="button" onClick={() => setLayer(true)}>Pick a day</button>
          {layer && createPortal(
            <>
              <button type="button">A</button>
              <button type="button">B</button>
            </>,
            document.body,
          )}
        </TestDialog>
      );
    }
    render(<WithLayer />);
    await user.click(screen.getByRole('button', { name: 'Pick a day' }));
    const a = screen.getByRole('button', { name: 'A' });
    // Opened from inside the dialog, the layer comes after the sheet in the document, as the date
    // picker's calendar does: nothing in the sheet lies ahead of it.
    expect(screen.getByRole('dialog').compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    a.focus();
    await user.tab();
    const b = screen.getByRole('button', { name: 'B' });
    expect(b).toHaveFocus();
    // From the layer's last stop, Tab is the browser's too: it leaves, and is not pulled into the sheet.
    await user.tab();
    expect(b).not.toHaveFocus();
    expect(screen.getByRole('button', { name: 'Pick a day' })).not.toHaveFocus();
  });

  it('closes on a mousedown on the scrim only, and a mousedown on a portaled layer does not close it', () => {
    const onClose = vi.fn();
    render(
      <TestDialog open onClose={onClose}>
        <button type="button">Inside</button>
        {createPortal(<button type="button">Day</button>, document.body)}
      </TestDialog>,
    );
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Inside' }));
    fireEvent.mouseDown(screen.getByRole('dialog'));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Day' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('Dialog scrim'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc closes only the topmost of two dialogs, and the scrim below does nothing', async () => {
    const user = userEvent.setup();
    const closeA = vi.fn();
    const closeB = vi.fn();
    render(
      <>
        <TestDialog open onClose={closeA} label="A"><button type="button">In A</button></TestDialog>
        <TestDialog open onClose={closeB} label="B"><button type="button">In B</button></TestDialog>
      </>,
    );
    await user.keyboard('{Escape}');
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId('A scrim'));
    expect(closeA).not.toHaveBeenCalled();
  });

  it('Esc with a shared Popover open inside closes only the Popover', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    function WithPopover() {
      const [menu, setMenu] = useState(true);
      return (
        <TestDialog open onClose={onClose}>
          <Popover open={menu} onClose={() => setMenu(false)} anchor={<button type="button">More</button>}>
            <button type="button">Rename</button>
          </Popover>
        </TestDialog>
      );
    }
    render(<WithPopover />);
    screen.getByRole('button', { name: 'Rename' }).focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Rename' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc with a tooltip bubble up inside hides only the bubble', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <TestDialog open onClose={onClose}>
        <Tooltip content="Due Friday"><span>TSR 4</span></Tooltip>
      </TestDialog>,
    );
    const tooltip = document.querySelector('.gt-tooltip') as HTMLElement;
    await user.hover(tooltip);
    await user.keyboard('{Escape}');
    expect(tooltip).toHaveClass('gt-tooltip--dismissed');
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores an Esc that an inner handler took, and one that ends a composition', () => {
    const onClose = vi.fn();
    render(
      <TestDialog open onClose={onClose}>
        <input
          aria-label="Name"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && e.currentTarget.value) e.preventDefault();
          }}
          defaultValue="Draft"
        />
      </TestDialog>,
    );
    const name = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.keyDown(name, { key: 'Escape' });
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.keyDown(name, { key: 'Escape', isComposing: true });
    fireEvent.keyDown(name, { key: 'Escape', keyCode: 229 });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(name, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closeDisabled blocks Esc and the scrim', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<TestDialog open closeDisabled onClose={onClose}><input aria-label="Name" /></TestDialog>);
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByTestId('Dialog scrim'));
    expect(onClose).not.toHaveBeenCalled();

    // The latest props count, without reopening.
    rerender(<TestDialog open onClose={onClose}><input aria-label="Name" /></TestDialog>);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('locks scroll, and restores the original overflow only after dialogs close out of order', () => {
    document.body.style.overflow = 'scroll';
    const { rerender } = render(
      <>
        <TestDialog open label="A" />
        <TestDialog open label="B" />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <TestDialog open={false} label="A" />
        <TestDialog open label="B" />
      </>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <>
        <TestDialog open={false} label="A" />
        <TestDialog open={false} label="B" />
      </>,
    );
    expect(document.body.style.overflow).toBe('scroll');
  });

  it('leaves the overflow a hand-built modal around it set, when both close at once', () => {
    // A hand-built modal (Class Settings) that locks the page itself: hidden on mount, unset on cleanup.
    function HandBuilt({ asking }: { asking: boolean }) {
      useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
          document.body.style.overflow = 'unset';
        };
      }, []);
      return <TestDialog open={asking} label="Question" />;
    }
    const { rerender, unmount } = render(<HandBuilt asking={false} />);
    rerender(<HandBuilt asking />);
    expect(document.body.style.overflow).toBe('hidden');
    // A route change takes both away, the modal's cleanup first: the next page must scroll.
    unmount();
    expect(document.body.style.overflow).toBe('unset');
  });

  it('leaves focus alone when the opener no longer exists', async () => {
    const user = userEvent.setup();
    function GoneOpener() {
      const [open, setOpen] = useState(false);
      const [opener, setOpener] = useState(true);
      return (
        <>
          {opener && <button type="button" onClick={() => setOpen(true)}>Open</button>}
          <TestDialog open={open} onClose={() => setOpen(false)}>
            <button type="button" onClick={() => setOpener(false)}>Remove the row</button>
          </TestDialog>
        </>
      );
    }
    render(<GoneOpener />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await user.click(screen.getByRole('button', { name: 'Remove the row' }));
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.body).toHaveFocus();
  });

  it('leaves focus that the close moved on purpose where it is', async () => {
    const user = userEvent.setup();
    function MovesFocus() {
      const [open, setOpen] = useState(false);
      const target = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Opener</button>
          <button type="button" ref={target}>New row</button>
          <TestDialog open={open} onClose={() => setOpen(false)}>
            <button
              type="button"
              onClick={() => {
                target.current?.focus();
                setOpen(false);
              }}
            >
              Save
            </button>
          </TestDialog>
        </>
      );
    }
    render(<MovesFocus />);
    // Opened from a real button, so a dialog that always gave focus back would land on it.
    await user.click(screen.getByRole('button', { name: 'Opener' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('button', { name: 'New row' })).toHaveFocus();
  });

  it('stays mounted while it closes, then unmounts; reopening during the fade keeps it', () => {
    vi.useFakeTimers();
    const { rerender } = render(<TestDialog open><input aria-label="Name" /></TestDialog>);
    rerender(<TestDialog open={false}><input aria-label="Name" /></TestDialog>);
    expect(screen.getByTestId('Dialog scrim')).toHaveAttribute('data-closing', 'true');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    rerender(<TestDialog open><input aria-label="Name" /></TestDialog>);
    expect(screen.getByTestId('Dialog scrim')).not.toHaveAttribute('data-closing');
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    rerender(<TestDialog open={false}><input aria-label="Name" /></TestDialog>);
    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('unmounts at once under reduced motion', () => {
    const matchMedia = vi.fn((query: string) => ({ matches: query.includes('reduce') }) as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      const { rerender } = render(<TestDialog open />);
      rerender(<TestDialog open={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('in place, joins no stack and moves no focus, scroll or keys', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <>
        <button type="button">Page</button>
        <TestDialog open inPlace onClose={onClose}><input aria-label="Name" /></TestDialog>
      </>,
    );
    expect(screen.getByRole('textbox', { name: 'Name' })).not.toHaveFocus();
    expect(document.body.style.overflow).toBe('');
    screen.getByRole('button', { name: 'Page' }).focus();
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByTestId('Dialog scrim'));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('dialogStack', () => {
  it('knows the topmost dialog, and pops out of order', () => {
    const a = Symbol('a');
    const b = Symbol('b');
    expect(isTopDialog(a)).toBe(false);
    pushDialog(a);
    pushDialog(b);
    expect(isTopDialog(b)).toBe(true);
    popDialog(a);
    expect(isTopDialog(b)).toBe(true);
    popDialog(a); // gone already: nothing to do
    popDialog(b);
    expect(isTopDialog(b)).toBe(false);
  });
});

describe('lockBodyScroll', () => {
  it('leaves an overflow that something else set while it held the lock', () => {
    document.body.style.overflow = 'auto';
    const release = lockBodyScroll();
    document.body.style.overflow = 'unset';
    release();
    expect(document.body.style.overflow).toBe('unset');
  });

  it('counts each release once', () => {
    document.body.style.overflow = 'auto';
    const first = lockBodyScroll();
    const second = lockBodyScroll();
    first();
    first();
    expect(document.body.style.overflow).toBe('hidden');
    second();
    expect(document.body.style.overflow).toBe('auto');
  });
});

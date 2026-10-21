import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Modal } from '@/components/Modal/Modal';
import { ConfirmDialog, InlineConfirm, type ConfirmDialogProps } from '../ConfirmDialog';

const DEFAULT_ERROR = 'That didn’t work. Try again.';

/** The dialog moves focus in a moment after it opens: let that moment pass. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** A promise the test settles. */
function deferred() {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A ConfirmDialog whose caller keeps it open until onCancel, or until onConfirm finishes. */
function Asking(props: Partial<ConfirmDialogProps> & { onDone?: () => void }) {
  const { onDone, onConfirm, onCancel, ...rest } = props;
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      title="Remove Ben Okafor?"
      message="He loses access to Team 4's board and chat."
      confirmLabel="Remove"
      busyLabel="Removing…"
      destructive
      {...rest}
      onCancel={() => {
        onCancel?.();
        setOpen(false);
      }}
      onConfirm={async () => {
        await onConfirm?.();
        onDone?.();
        setOpen(false);
      }}
    />
  );
}

describe('ConfirmDialog', () => {
  it('is an alertdialog named by its title and described by its message, with Cancel focused first', async () => {
    render(<ConfirmDialog open title="Delete project?" message="This cannot be undone." onCancel={() => {}} />);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete project?' });
    expect(dialog).toHaveAccessibleDescription('This cannot be undone.');
    expect(dialog).toHaveClass('gt-modal', 'gt-modal--sm');
    expect(screen.getByText('This cannot be undone.')).toHaveClass('gt-confirm__message');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await settle();
    expect(cancel).toHaveFocus();
    expect(cancel).toHaveClass('gt-button--outline');
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toHaveClass('gt-button--primary');
    expect(cancel.parentElement).toHaveClass('gt-modal__footer');
    expect(cancel.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opened by Enter in a field, leaves that Enter to the field and then focuses Cancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    function AsksOnEnter() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <input
            aria-label="Sprint name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setOpen(true);
            }}
          />
          <ConfirmDialog
            open={open}
            title="Rename Sprint 3?"
            message="Its board link changes."
            onCancel={() => {
              onCancel();
              setOpen(false);
            }}
          />
        </>
      );
    }
    render(<AsksOnEnter />);
    await user.type(screen.getByRole('textbox', { name: 'Sprint name' }), '{Enter}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Rename Sprint 3?' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());
  });

  it('labels its buttons, and Confirm is the solid danger button when destructive', async () => {
    render(
      <ConfirmDialog open destructive title="Switch to template?" message="Other content is dropped." confirmLabel="Switch to template" cancelLabel="Stay" />,
    );
    expect(screen.getByRole('button', { name: 'Switch to template' })).toHaveClass('gt-button--danger');
    await settle();
    expect(screen.getByRole('button', { name: 'Stay' })).toHaveFocus();
  });

  it('Confirm runs onConfirm, and the caller closes it', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Asking onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('Cancel, Esc, the scrim and the × all run onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Leave CSE 115A?" message="You can rejoin later." onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByRole('alertdialog').parentElement as HTMLElement);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancel).toHaveBeenCalledTimes(4);
    // Never with the click event: onCancel={setTarget} would store it.
    expect(onCancel.mock.calls.every((call) => call.length === 0)).toBe(true);
  });

  it('while onConfirm is pending, Esc and the scrim do nothing, Cancel waits and Confirm stays focused and busy', async () => {
    const user = userEvent.setup();
    const job = deferred();
    const onConfirm = vi.fn(() => job.promise);
    const onCancel = vi.fn();
    const onDone = vi.fn();
    render(<Asking onConfirm={onConfirm} onCancel={onCancel} onDone={onDone} />);
    const confirm = screen.getByRole('button', { name: 'Remove' });
    await user.click(confirm);

    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(confirm).toHaveAccessibleName('Removing…');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByRole('alertdialog').parentElement as HTMLElement);
    // A second click or Enter on the busy button sends nothing more.
    await user.click(confirm);
    await user.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => job.resolve());
    expect(onDone).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('a rejection shows an alert inside and keeps the dialog open; the next try clears it', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(undefined);
    render(<ConfirmDialog open title="Delete Sprint 3?" message="Its 14 stories move back to the backlog." confirmLabel="Delete sprint" onConfirm={onConfirm} />);
    const confirm = screen.getByRole('button', { name: 'Delete sprint' });
    await user.click(confirm);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(DEFAULT_ERROR);
    expect(alert).toHaveClass('gt-alert--error', 'gt-confirm__error');
    expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toBe(alert);
    expect(confirm).not.toHaveAttribute('aria-busy');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('shows the error for a confirmation that throws, in errorText when given', async () => {
    const user = userEvent.setup();
    render(
      <ConfirmDialog
        open
        title="Clear the description?"
        message="All of it goes."
        errorText="Couldn’t clear it."
        onConfirm={() => {
          throw new Error('boom');
        }}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t clear it.');
  });

  it('takes busy and error from its caller', () => {
    const { rerender } = render(
      <ConfirmDialog open busy busyLabel="Leaving…" title="Leave CSE 115A?" message="You can rejoin later." confirmLabel="Leave class" />,
    );
    expect(screen.getByRole('button', { name: 'Leaving…' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    rerender(<ConfirmDialog open error="You are not enrolled in this class" title="Leave CSE 115A?" message="You can rejoin later." confirmLabel="Leave class" />);
    expect(screen.getByRole('alert')).toHaveTextContent('You are not enrolled in this class');
    expect(screen.getByRole('button', { name: 'Leave class' })).not.toHaveAttribute('aria-busy');
  });

  it('starts clean each time it opens, and a confirmation that settles after it closed changes nothing', async () => {
    const user = userEvent.setup();
    const late = deferred();
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('500')).mockReturnValueOnce(late.promise);
    const props = { title: 'Delete Sprint 3?', message: 'Its stories move back.', onConfirm };
    const { rerender } = render(<ConfirmDialog open {...props} />);
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    rerender(<ConfirmDialog open={false} {...props} />);
    rerender(<ConfirmDialog open {...props} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    rerender(<ConfirmDialog open={false} {...props} />);
    rerender(<ConfirmDialog open {...props} />);
    await act(async () => late.reject(new Error('late')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).not.toHaveAttribute('aria-busy');
  });

  it('opened over a Modal, Esc closes only the ConfirmDialog', async () => {
    const user = userEvent.setup();
    const closeModal = vi.fn();
    function EditProject() {
      const [confirming, setConfirming] = useState(false);
      return (
        <>
          <Modal open onClose={closeModal} title="Edit project">
            <button type="button" onClick={() => setConfirming(true)}>Delete project</button>
          </Modal>
          <ConfirmDialog open={confirming} destructive title="Delete project?" message="This cannot be undone." onCancel={() => setConfirming(false)} />
        </>
      );
    }
    render(<EditProject />);
    const opener = screen.getByRole('button', { name: 'Delete project' });
    await user.click(opener);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(closeModal).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Edit project' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(closeModal).toHaveBeenCalledTimes(1);
  });

  it('renders in place with portal={false}, and passes className and ref to its sheet', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(
      <ConfirmDialog open portal={false} className="x" ref={ref} title="Remove Ben Okafor?" message="He loses access." />,
    );
    const dialog = within(container).getByRole('alertdialog');
    expect(ref.current).toBe(dialog);
    expect(dialog).toHaveClass('gt-modal', 'x');
  });
});

describe('InlineConfirm', () => {
  it('is a group named by its sentence, with Cancel focused, then danger Delete', () => {
    render(<InlineConfirm message="Delete ‘Sprint 3 planning’? It disappears from your team’s calendars." />);
    const group = screen.getByRole('group', { name: 'Delete ‘Sprint 3 planning’? It disappears from your team’s calendars.' });
    expect(group).toHaveClass('gt-inline-confirm');
    const cancel = within(group).getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();
    expect(cancel).toHaveClass('gt-button--outline', 'gt-button--sm');
    expect(within(group).getByRole('button', { name: 'Delete' })).toHaveClass('gt-button--danger', 'gt-button--sm');
    expect(group.querySelector('.gt-inline-confirm__icon svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('runs onConfirm and onCancel, with its own labels', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<InlineConfirm message="Remove Ana Ruiz from the team?" confirmLabel="Remove" cancelLabel="Keep" onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onConfirm).toHaveBeenCalledWith();
    expect(onCancel).toHaveBeenCalledWith();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Esc cancels without closing the dialog around it', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const closeModal = vi.fn();
    render(
      <Modal open onClose={closeModal} title="Edit project">
        <InlineConfirm message="Delete ‘Sprint 3 planning’?" onCancel={onCancel} />
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(closeModal).not.toHaveBeenCalled();
  });

  it('while busy, Delete is busy and keeps focus, Cancel waits, and Esc does nothing at all', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const closeModal = vi.fn();
    render(
      <Modal open onClose={closeModal} title="Edit project">
        <InlineConfirm message="Remove Ana Ruiz from the team?" confirmLabel="Remove" busyLabel="Removing…" busy autoFocus={false} onCancel={onCancel} />
      </Modal>,
    );
    const confirm = screen.getByRole('button', { name: 'Removing…' });
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    confirm.focus();
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
    expect(closeModal).not.toHaveBeenCalled();
    expect(confirm).toHaveFocus();
  });

  it('leaves focus alone with autoFocus={false}, and runs a caller’s onKeyDown first', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onKeyDown = vi.fn((e: React.KeyboardEvent) => e.preventDefault());
    render(
      <>
        <button type="button">Elsewhere</button>
        <InlineConfirm message="Delete it?" autoFocus={false} onCancel={onCancel} onKeyDown={onKeyDown} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Cancel' })).not.toHaveFocus();
    screen.getByRole('button', { name: 'Cancel' }).focus();
    await user.keyboard('{Escape}');
    expect(onKeyDown).toHaveBeenCalled();
    // The caller took the key, so the confirm leaves it alone.
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('passes native props, className and ref to its group, and keeps its role and name to itself', () => {
    const ref = createRef<HTMLDivElement>();
    // @ts-expect-error: a caller's role would be overwritten; it is always a group
    const roled = <InlineConfirm message="Delete it?" role="alert" />;
    // @ts-expect-error: a caller's aria-labelledby would be overwritten; the sentence names it
    const named = <InlineConfirm message="Remove it?" aria-labelledby="elsewhere" className="x" data-key="i" ref={ref} />;
    render(<>{roled}{named}</>);
    expect(screen.getByRole('group', { name: 'Delete it?' })).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Remove it?' });
    expect(ref.current).toBe(group);
    expect(group).toHaveClass('gt-inline-confirm', 'x');
    expect(group).toHaveAttribute('data-key', 'i');
  });

  it('stretches its buttons on phones', () => {
    render(<InlineConfirm message="Delete it?" />);
    expect(cssRules('.gt-inline-confirm__actions', 'max-width: 767px')[0].getPropertyValue('width')).toBe('100%');
    expect(cssRules('.gt-inline-confirm__actions .gt-button', 'max-width: 767px')[0].getPropertyValue('flex')).toBe('1 1 auto');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast, ToastStack } from '../Toast';
import { useToasts } from '../useToasts';

describe('Toast', () => {
  it('renders the message with a variant class and alerts on errors', () => {
    const { container } = render(<Toast variant="error" message="Couldn’t move GT-12" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.querySelector('.gt-toast--error')).not.toBeNull();
  });

  it('uses a polite status for non-errors, and maps neutral onto info', () => {
    const { container } = render(<Toast variant="neutral" message="Read-only preview" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.querySelector('.gt-toast--info')).not.toBeNull();
  });

  it('runs the action and dismisses on demand', async () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(<Toast variant="error" message="Failed" actionLabel="Retry" onAction={onAction} onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onAction).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await new Promise((r) => setTimeout(r, 200));   // exit animation
    expect(onDismiss).toHaveBeenCalled();
  });

  it('auto-dismisses a success but leaves an actionable error standing', () => {
    vi.useFakeTimers();
    const success = vi.fn();
    const { unmount } = render(<Toast variant="success" message="Saved" onDismiss={success} />);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(success).toHaveBeenCalled();
    unmount();

    const sticky = vi.fn();
    render(<Toast variant="error" message="Failed" actionLabel="Retry" onDismiss={sticky} />);
    act(() => { vi.advanceTimersByTime(30000); });
    expect(sticky).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe('ToastStack', () => {
  it('renders nothing when empty and caps the stack at three', () => {
    const { container, rerender } = render(<ToastStack toasts={[]} />);
    expect(container.querySelector('.gt-toast-stack')).toBeNull();

    rerender(<ToastStack toasts={[1, 2, 3, 4].map((id) => ({ id, message: `n${id}` }))} />);
    expect(container.querySelectorAll('.gt-toast')).toHaveLength(3);
    expect(screen.queryByText('n4')).not.toBeInTheDocument();
  });
});

describe('useToasts', () => {
  it('queues newest first and dismisses by id', () => {
    const { result } = renderHook(() => useToasts());
    let firstId: string | number = 0;
    act(() => { firstId = result.current.push('info', 'first'); });
    act(() => { result.current.push('error', 'second'); });

    expect(result.current.toasts.map((t) => t.message)).toEqual(['second', 'first']);
    act(() => { result.current.dismiss(firstId); });
    expect(result.current.toasts.map((t) => t.message)).toEqual(['second']);
  });
});

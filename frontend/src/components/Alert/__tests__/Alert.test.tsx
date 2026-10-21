import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { Button } from '@/components/Button/Button';
import { Alert } from '../Alert';

describe('Alert', () => {
  it('error is an alert, other tones are status, info by default', () => {
    const { rerender, container } = render(<Alert tone="error">Couldn’t save this meeting.</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save this meeting.');
    expect(container.firstChild).toHaveClass('gt-alert', 'gt-alert--error');
    for (const tone of ['success', 'warning', 'info'] as const) {
      rerender(<Alert tone={tone}>Note</Alert>);
      expect(screen.getByRole('status')).toHaveClass(`gt-alert--${tone}`);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
    rerender(<Alert>Preview mode</Alert>);
    expect(screen.getByRole('status')).toHaveClass('gt-alert--info');
  });

  it('shows a title over its body, with a hidden icon for each tone', () => {
    const { container } = render(<Alert tone="warning" title="You have an unsent draft">Restore it or discard it.</Alert>);
    const alert = screen.getByRole('status');
    expect(within(alert).getByText('You have an unsent draft')).toHaveClass('gt-alert__title');
    // The body is a <div>, so paragraphs and links both fit in it.
    const body = within(alert).getByText('Restore it or discard it.');
    expect(body.tagName).toBe('DIV');
    expect(body).toHaveClass('gt-alert__text');
    const icon = container.querySelector('.gt-alert__icon');
    expect(icon?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders neither title nor body when it has none', () => {
    const { container } = render(<Alert title="Saved" />);
    expect(container.querySelector('.gt-alert__text')).toBeNull();
    expect(container.querySelector('.gt-alert__actions')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('Dismiss calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<Alert onDismiss={onDismiss}>Preview mode — students can’t see changes yet.</Alert>);
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss).toHaveAttribute('type', 'button');
    expect(dismiss).toHaveClass('gt-alert__dismiss');
    await userEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith();
  });

  it('renders actions after the text, outside it', async () => {
    const retry = vi.fn();
    const { container } = render(
      <Alert tone="error" title="Couldn’t save this meeting." actions={<Button size="sm" variant="outline" onClick={retry}>Try again</Button>}>
        Your changes are still here.
      </Alert>,
    );
    expect(container.querySelector('.gt-alert__text button')).toBeNull();
    const button = screen.getByRole('button', { name: 'Try again' });
    expect(button.parentElement).toHaveClass('gt-alert__actions');
    await userEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('passes native props, className and ref to its box, and keeps its role to itself', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Alert tone="success" className="x" data-key="a" ref={ref}>Saved</Alert>);
    const alert = screen.getByRole('status');
    expect(ref.current).toBe(alert);
    expect(alert).toHaveClass('gt-alert', 'x');
    expect(alert).toHaveAttribute('data-key', 'a');

    // @ts-expect-error: a caller's role would be overwritten; the tone decides it
    const roled = <Alert tone="error" role="note">Failed</Alert>;
    render(roled);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });

  it('keeps the dismiss small, with a 44px target on phones', () => {
    render(<Alert onDismiss={() => {}}>Note</Alert>);
    const [dismiss] = cssRules('.gt-alert__dismiss');
    // Its own padding and border beat index.css's global button rule.
    expect(dismiss.getPropertyValue('padding')).toBe('2px');
    expect(dismiss.getPropertyValue('border-style')).toBe('none');
    const [phone] = cssRules('.gt-alert__dismiss', 'max-width: 767px');
    expect(phone.getPropertyValue('min-width')).toBe('44px');
    expect(phone.getPropertyValue('min-height')).toBe('44px');
  });
});

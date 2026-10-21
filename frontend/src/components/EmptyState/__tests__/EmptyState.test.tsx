import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FolderOpen } from 'lucide-react';
import { cssRules } from '@/test/cssRules';
import { Button } from '@/components/Button/Button';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders the title at the requested heading level, h3 by default, or as a paragraph', () => {
    const { rerender } = render(<EmptyState title="No projects yet" titleAs="h2" />);
    expect(screen.getByRole('heading', { level: 2, name: 'No projects yet' })).toHaveClass('gt-empty__title');
    rerender(<EmptyState title="No projects yet" />);
    expect(screen.getByRole('heading', { level: 3, name: 'No projects yet' })).toBeInTheDocument();
    rerender(<EmptyState title="No projects yet" titleAs="p" />);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('No projects yet').tagName).toBe('P');
  });

  it('renders its description and action', async () => {
    const create = vi.fn();
    render(
      <EmptyState
        title="No projects yet"
        description="Projects your class creates appear here."
        action={<Button onClick={create}>Create project</Button>}
      />,
    );
    expect(screen.getByText('Projects your class creates appear here.')).toHaveClass('gt-empty__desc');
    const button = screen.getByRole('button', { name: 'Create project' });
    expect(button.parentElement).toHaveClass('gt-empty__action');
    await userEvent.click(button);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('takes the page look by default, and a variant or compact class otherwise', () => {
    const { container, rerender } = render(<EmptyState title="Empty" />);
    expect(container.firstChild).toHaveClass('gt-empty');
    expect((container.firstChild as HTMLElement).className).toBe('gt-empty');
    for (const variant of ['card', 'quiet', 'error'] as const) {
      rerender(<EmptyState title="Empty" variant={variant} />);
      expect(container.firstChild).toHaveClass('gt-empty', `gt-empty--${variant}`);
    }
    rerender(<EmptyState title="Empty" compact />);
    expect(container.firstChild).toHaveClass('gt-empty', 'gt-empty--compact');
  });

  it('wraps the icon in a well that assistive tech skips, and drops it for quiet and error', () => {
    const { container, rerender } = render(<EmptyState icon={<FolderOpen size={28} />} title="No projects yet" />);
    const well = container.querySelector('.gt-empty__icon');
    expect(well).toHaveAttribute('aria-hidden', 'true');
    expect(well?.querySelector('svg')).not.toBeNull();
    rerender(<EmptyState icon={<FolderOpen size={28} />} title="No upcoming meetings." variant="quiet" />);
    expect(container.querySelector('.gt-empty__icon')).toBeNull();
    rerender(<EmptyState icon={<FolderOpen size={28} />} title="Couldn’t load team meetings." variant="error" />);
    expect(container.querySelector('.gt-empty__icon')).toBeNull();
  });

  it('error is a status, and its Try again link calls onRetry', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(<EmptyState variant="error" title="Couldn’t load team meetings." onRetry={onRetry} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Couldn’t load team meetings.');
    const retry = within(status).getByRole('button', { name: 'Try again' });
    expect(retry).toHaveClass('gt-empty__retry');
    expect(retry).toHaveAttribute('type', 'button');
    expect(retry.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(<EmptyState variant="error" title="Couldn’t load." onRetry={onRetry} retryLabel="Reload" />);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    rerender(<EmptyState variant="quiet" title="No upcoming meetings." />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('passes native props, className and ref to its box, and keeps its role to itself', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<EmptyState title="Empty" className="x" data-key="e" ref={ref} />);
    expect(ref.current).toBe(container.firstChild);
    expect(container.firstChild).toHaveClass('gt-empty', 'x');
    expect(container.firstChild).toHaveAttribute('data-key', 'e');

    // @ts-expect-error: a caller's role would be overwritten; the error variant is a status
    const roled = <EmptyState title="Failed" variant="error" role="alert" />;
    render(roled);
    expect(screen.getByRole('status')).toHaveTextContent('Failed');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('draws the card well small and sunken, and its Try again link without the global button padding', () => {
    render(<EmptyState title="Empty" variant="card" />);
    const [cardWell] = cssRules('.gt-empty--card .gt-empty__icon');
    expect(cardWell.getPropertyValue('width')).toBe('36px');
    expect(cardWell.getPropertyValue('background')).toBe('var(--gt-surface-sunken)');
    const [retry] = cssRules('.gt-empty__retry');
    expect(retry.getPropertyValue('padding')).toBe('0px');
    expect(retry.getPropertyValue('font-weight')).toBe('var(--gt-weight-medium)');
  });
});

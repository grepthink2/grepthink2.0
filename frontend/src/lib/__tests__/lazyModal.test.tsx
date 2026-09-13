import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { lazyModal } from '../lazyModal';

interface Props {
  isOpen: boolean;
  label: string;
}

function FakeModal({ isOpen, label }: Props) {
  return <div data-testid="modal">{`${label}:${isOpen ? 'open' : 'closed'}`}</div>;
}

describe('lazyModal', () => {
  it('loads nothing until the first open, then stays mounted so the close can animate', async () => {
    const load = vi.fn(() => Promise.resolve({ default: FakeModal }));
    const LazyFake = lazyModal(load, (p: Props) => p.isOpen);

    const { rerender } = render(<LazyFake isOpen={false} label="x" />);
    expect(load).not.toHaveBeenCalled();
    expect(screen.queryByTestId('modal')).toBeNull();

    rerender(<LazyFake isOpen label="x" />);
    expect(await screen.findByTestId('modal')).toHaveTextContent('x:open');
    expect(load).toHaveBeenCalledTimes(1);

    rerender(<LazyFake isOpen={false} label="x" />);
    expect(screen.getByTestId('modal')).toHaveTextContent('x:closed');
  });

  it('renders straight away when mounted open', async () => {
    const LazyFake = lazyModal(() => Promise.resolve({ default: FakeModal }), (p: Props) => p.isOpen);
    render(<LazyFake isOpen label="y" />);
    expect(await screen.findByTestId('modal')).toHaveTextContent('y:open');
  });
});

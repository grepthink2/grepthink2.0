import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Icon } from '../Icon';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Icon', () => {
  it('renders the named lucide icon at the size given', () => {
    const { container } = render(<Icon name="Trash2" size={20} aria-label="Delete" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveAttribute('height', '20');
    expect(svg).toHaveAttribute('aria-label', 'Delete');
    expect(svg).toHaveClass('lucide-trash-2');
  });

  it('is 16 pixels by default', () => {
    const { container } = render(<Icon name="Plus" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '16');
  });

  it('renders nothing for an unknown name, and warns once for it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, rerender } = render(<Icon name="NoSuchIcon" />);
    rerender(<Icon name="NoSuchIcon" size={24} />);
    render(<Icon name="NoSuchIcon" />);
    expect(container).toBeEmptyDOMElement();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Icon: unknown icon "NoSuchIcon"');
  });
});

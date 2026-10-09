import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SplitBar } from '../SplitBar';

describe('SplitBar', () => {
  it('sizes segments by share, lists counts in the legend, and carries the school-wide note', () => {
    const { container } = render(
      <SplitBar segments={[{ key: 'team', label: 'Team channels', value: 572, colorClass: 'gt-series--1' }, { key: 'dm', label: 'Direct', value: 712, note: 'school-wide', colorClass: 'gt-series--2' }]} />,
    );
    const segs = container.querySelectorAll<HTMLElement>('.gt-split__segment');
    expect(segs).toHaveLength(2);
    expect(segs[0].style.flexGrow).toBe('572');
    expect(segs[1].style.flexGrow).toBe('712');
    expect(screen.getByText('572')).toBeInTheDocument();
    expect(screen.getByText(/school-wide/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Team channels 572, Direct 712/ })).toBeInTheDocument();
  });
  it('shows an even empty track when both are zero', () => {
    const { container } = render(<SplitBar segments={[{ key: 'a', label: 'A', value: 0, colorClass: 'gt-series--1' }, { key: 'b', label: 'B', value: 0, colorClass: 'gt-series--2' }]} />);
    expect(container.querySelector('.gt-split--empty')).not.toBeNull();
  });
  it('draws no fill for a zero share beside a non-zero one (no stray 2px gap) but keeps it in the legend', () => {
    const { container } = render(<SplitBar segments={[{ key: 'team', label: 'Team channels', value: 0, colorClass: 'gt-series--1' }, { key: 'dm', label: 'Direct', value: 712, colorClass: 'gt-series--2' }]} />);
    const segs = container.querySelectorAll<HTMLElement>('.gt-split__segment');
    expect(segs).toHaveLength(1);
    expect(segs[0]).toHaveClass('gt-series--2');
    expect(container.querySelector('.gt-split--empty')).toBeNull();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Team channels 0, Direct 712' })).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import { TableSkeleton } from '../TableSkeleton';

describe('TableSkeleton', () => {
  const headers = ['Name', 'Email', 'Role'];

  it('keeps the title and column headers visible while loading', () => {
    render(<TableSkeleton block="roster-list" title="Student Count" headers={headers} rows={3} />);
    expect(screen.getByRole('heading', { name: 'Student Count' })).toBeInTheDocument();
    headers.forEach((h) => {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
    });
  });

  it('marks the region as busy for assistive tech', () => {
    const { container } = render(
      <TableSkeleton block="roster-list" title="Roster" headers={headers} rows={2} />,
    );
    expect(container.querySelector('.roster-list')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders rows x columns shimmer cells', () => {
    const { container } = render(
      <TableSkeleton block="roster-list" title="Roster" headers={headers} rows={4} />,
    );
    // 4 rows * 3 columns = 12 placeholder blocks.
    expect(container.querySelectorAll('.skeleton')).toHaveLength(12);
  });

  it('reuses the block name for BEM class hooks so layout matches the real table', () => {
    const { container } = render(
      <TableSkeleton block="assignment-list" title="Assignments" headers={['Title']} rows={1} />,
    );
    expect(container.querySelector('.assignment-list__table')).toBeInTheDocument();
  });
});

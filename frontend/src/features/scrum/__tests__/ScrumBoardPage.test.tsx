import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ScrumBoardPage, { ScrumBoardSkeleton, BOARD_VIEWS } from '../pages/ScrumBoardPage';

function renderAt(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/projects/:projectId/board" element={<ScrumBoardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ScrumBoardPage', () => {
  it('renders the three full-width sub-view tabs (L2)', () => {
    renderAt('/app/projects/p1/board');
    expect(BOARD_VIEWS).toEqual(['board', 'backlog', 'burnup']);
    ['Board', 'Backlog', 'Burnup'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
  });

  it('defaults to the board tab when ?view is absent or unknown', () => {
    renderAt('/app/projects/p1/board?view=nonsense');
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'true');
  });

  it('honours a deep-linked ?view', () => {
    renderAt('/app/projects/p1/board?view=burnup');
    expect(screen.getByRole('tab', { name: 'Burnup' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Board' })).toHaveAttribute('aria-selected', 'false');
  });

  it('switches tabs on click', async () => {
    const user = userEvent.setup();
    renderAt('/app/projects/p1/board');
    await user.click(screen.getByRole('tab', { name: 'Backlog' }));
    expect(screen.getByRole('tab', { name: 'Backlog' })).toHaveAttribute('aria-selected', 'true');
  });

  it('skeleton marks the region busy', () => {
    const { container } = render(<ScrumBoardSkeleton />);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
  });
});

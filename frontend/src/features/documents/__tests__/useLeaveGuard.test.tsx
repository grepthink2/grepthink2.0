import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useLeaveGuard } from '../hooks/useLeaveGuard';

/** A page with unsaved changes while `dirty`, and the ways out of it. */
function Page({ initiallyDirty = true }: { initiallyDirty?: boolean }) {
  const [dirty, setDirty] = useState(initiallyDirty);
  const guard = useLeaveGuard(dirty);
  const navigate = useNavigate();
  return (
    <div>
      <Link to="/away">Away</Link>
      <button type="button" onClick={() => navigate('/away')}>Go away</button>
      <button type="button" onClick={() => navigate('/page?tab=1', { replace: true })}>Change query</button>
      <button type="button" onClick={() => navigate('/page')}>Same page</button>
      <button type="button" onClick={() => guard.leave(() => navigate('/away'))}>Leave on purpose</button>
      <button type="button" onClick={() => setDirty(false)}>Save</button>
      {guard.blocked && (
        <div role="alertdialog" aria-label="Leave without saving?">
          <button type="button" onClick={guard.proceed}>Leave</button>
          <button type="button" onClick={guard.stay}>Stay</button>
        </div>
      )}
    </div>
  );
}

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const renderPage = (initiallyDirty?: boolean) => render(
  <MemoryRouter initialEntries={['/page']}>
    <Routes>
      <Route path="/page" element={<Page initiallyDirty={initiallyDirty} />} />
      <Route path="/away" element={<p>Away page</p>} />
    </Routes>
    <Where />
  </MemoryRouter>,
);

const where = () => screen.getByTestId('where').textContent;

describe('useLeaveGuard', () => {
  it('holds a link out of a dirty page until the reader chooses to leave', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('link', { name: 'Away' }));
    expect(where()).toBe('/page');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(where()).toBe('/away');
    expect(screen.getByText('Away page')).toBeInTheDocument();
  });

  it('holds a navigate() call too, and Stay drops it', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Go away' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(where()).toBe('/page');
  });

  it('holds a change of the query, and lets the page’s own path and query pass', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Change query' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stay' }));
    await userEvent.click(screen.getByRole('button', { name: 'Same page' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('lets a navigation the page means to make through', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Leave on purpose' }));
    expect(where()).toBe('/away');
  });

  it('holds nothing once the changes are saved', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('link', { name: 'Away' }));
    expect(where()).toBe('/away');
  });

  it('asks the browser to confirm leaving the site only while dirty', async () => {
    const { unmount } = renderPage();
    const event = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    unmount();

    renderPage(false);
    const clean = new Event('beforeunload', { cancelable: true });
    act(() => { window.dispatchEvent(clean); });
    expect(clean.defaultPrevented).toBe(false);
  });
});

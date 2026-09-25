import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({
  showSchoolSwitcher: true,
  schools: [
    { id: 'ist', name: 'İstinye University', slug: 'istinye' },
    { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' },
  ],
  currentSchool: { id: 'ist', name: 'İstinye University', slug: 'istinye' },
  selectedClass: { id: 'taught', my_role: 'instructor' },
  selectSchool: vi.fn(),
}));
vi.mock('@/lib/classContext', () => ({ useClass: () => ctx }));

import SchoolSwitcher from '../SchoolSwitcher';

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function renderAt(path: string, onPicked = vi.fn()) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SchoolSwitcher onPicked={onPicked} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return onPicked;
}

beforeEach(() => {
  ctx.showSchoolSwitcher = true;
  ctx.selectSchool.mockReset();
});

describe('SchoolSwitcher', () => {
  it('renders nothing for an account at one school', () => {
    ctx.showSchoolSwitcher = false;
    renderAt('/app/home');
    expect(screen.queryByRole('button', { name: /school:/i })).not.toBeInTheDocument();
  });

  it('shows the current school and expands in place', () => {
    renderAt('/app/home');
    const toggle = screen.getByRole('button', { name: 'School: İstinye University' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'İstinye University' })).toHaveAttribute('aria-current', 'true');
  });

  it('picks a school, closes the menu and lands on the page for the role there', () => {
    ctx.selectSchool.mockReturnValue({ id: 'c1', my_role: 'ta' });
    const onPicked = renderAt('/app/dashboard');
    fireEvent.click(screen.getByRole('button', { name: /school:/i }));
    fireEvent.click(screen.getByRole('button', { name: 'UC Santa Cruz' }));
    expect(ctx.selectSchool).toHaveBeenCalledWith('ucsc');
    expect(onPicked).toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/app/ta-meetings');
  });

  it('stays put when the pick keeps the class you are in', () => {
    // Previewing your class as a student on My Project, then picking its school again.
    ctx.selectSchool.mockReturnValue(ctx.selectedClass);
    const onPicked = renderAt('/app/my-project');
    fireEvent.click(screen.getByRole('button', { name: /school:/i }));
    fireEvent.click(screen.getByRole('button', { name: 'İstinye University' }));
    expect(ctx.selectSchool).toHaveBeenCalledWith('ist');
    expect(onPicked).toHaveBeenCalled();
    expect(screen.getByTestId('path').textContent).toBe('/app/my-project');
  });
});

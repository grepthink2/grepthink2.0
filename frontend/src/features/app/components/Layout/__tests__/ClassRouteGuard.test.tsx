import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassRole } from '@/lib/api';

const ctx = vi.hoisted(() => ({
  selectedClass: null as { id: string } | null,
  role: undefined as ClassRole | null | undefined,
}));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: ctx.selectedClass }),
  useSelectedClassRole: () => ctx.role,
}));

import ClassRouteGuard from '../ClassRouteGuard';

function Page() {
  return <output data-testid="page">{useLocation().pathname}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <ClassRouteGuard>
              <Page />
            </ClassRouteGuard>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const page = () => screen.queryByTestId('page')?.textContent;

beforeEach(() => {
  ctx.selectedClass = { id: 'c1' };
  ctx.role = 'student';
});

describe('ClassRouteGuard', () => {
  it('lets shared pages through while the classes load', () => {
    ctx.selectedClass = null;
    ctx.role = undefined;
    renderAt('/app/home');
    expect(page()).toBe('/app/home');
  });

  it('waits for the classes before deciding on a class page', () => {
    ctx.selectedClass = null;
    ctx.role = undefined;
    const { container } = renderAt('/app/dashboard');
    expect(page()).toBeUndefined();
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('sends class pages to My Classes when no class is selected', () => {
    ctx.selectedClass = null;
    ctx.role = null;
    renderAt('/app/my-project');
    expect(page()).toBe('/app/my-classes');
  });

  it('opens a class page your role in the selected class allows', () => {
    ctx.role = 'ta';
    renderAt('/app/my-project');
    expect(page()).toBe('/app/my-project');
  });

  it('lands a TA on TA Meetings from an instructor page', () => {
    ctx.role = 'ta';
    renderAt('/app/dashboard');
    expect(page()).toBe('/app/ta-meetings');
  });

  it('lands the class instructor on the Dashboard from a student page', () => {
    ctx.role = 'instructor';
    renderAt('/app/browse-projects');
    expect(page()).toBe('/app/dashboard');
  });

  it('keeps TA Review to a TA of the selected class', () => {
    ctx.role = 'student';
    renderAt('/app/ta-review/a1');
    expect(page()).toBe('/app/my-project');
  });

  it('treats a class previewed as a student like a student class', () => {
    // useSelectedClassRole reports 'student' for the class "view class as student" previews.
    ctx.role = 'student';
    renderAt('/app/ta-management');
    expect(page()).toBe('/app/my-project');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mixed = vi.hoisted(() => [
  { id: 'taught', name: 'SE 301', course_code: 'SE301X', created_by: 'me', created_at: '', status: 'active', my_role: 'instructor', institution: { id: 'ist', name: 'İstinye University', slug: 'istinye' } },
  { id: 'assisted', name: 'CSE 115C', created_by: 'prof', created_at: '', status: 'active', my_role: 'ta', institution: { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' } },
]);
const state = vi.hoisted(() => ({
  classes: [] as unknown[],
  canCreateClasses: true,
  previewing: false,
  previewClassId: null as string | null,
}));
const setSelectedClass = vi.hoisted(() => vi.fn());

vi.mock('@/lib/classContext', () => ({
  useClass: () => ({
    visibleClasses: state.classes,
    loading: false,
    successMessage: null,
    setSuccessMessage: vi.fn(),
    setSelectedClass,
    getClassStatus: () => 'active',
    refreshClasses: vi.fn(() => Promise.resolve()),
    previewClassId: state.previewClassId,
  }),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ canCreateClasses: state.canCreateClasses }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: state.previewing }) }));
vi.mock('@/lib/api', () => ({ api: { leaveClass: vi.fn() } }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useOutletContext: () => ({ openJoinClassModal: vi.fn() }),
}));

import MyClasses from '../MyClasses';

beforeEach(() => {
  state.classes = mixed;
  state.canCreateClasses = true;
  state.previewing = false;
  state.previewClassId = null;
  setSelectedClass.mockClear();
});

function Where() {
  return <output>{useLocation().pathname}</output>;
}

function renderWithRoutes() {
  render(
    <MemoryRouter initialEntries={['/app/my-classes']}>
      <Routes>
        <Route path="/app/my-classes" element={<MyClasses />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('My Classes with mixed roles', () => {
  it('draws each card from its own role, labels the roles, and groups by school', () => {
    render(<MemoryRouter><MyClasses /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Class settings' })).toBeInTheDocument(); // owner card
    expect(screen.getByRole('button', { name: 'Leave CSE 115C' })).toBeInTheDocument(); // TA card
    expect(screen.getByText('Instructor')).toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'İstinye University' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'UC Santa Cruz' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join class/i })).toBeInTheDocument();
  });

  it('offers Join Class only while you view a class as a student, like the sidebar', () => {
    state.previewing = true;
    render(<MemoryRouter><MyClasses /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /join class/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create class/i })).not.toBeInTheDocument();
  });

  it('opens a class on the page for your role in it', async () => {
    renderWithRoutes();
    await userEvent.click(screen.getByRole('button', { name: /open cse 115c/i }));
    expect(setSelectedClass).toHaveBeenCalledWith(mixed[1]);
    expect(screen.getByRole('status')).toHaveTextContent('/app/ta-meetings');
  });

  it('shows the class you view as a student as a student sees it, and opens it on My Project', async () => {
    state.previewing = true;
    state.previewClassId = 'taught';
    renderWithRoutes();
    // The learner card: no settings, no access code, a Leave button, the student's tag.
    expect(screen.queryByRole('button', { name: 'Class settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy access code/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave SE 301' })).toBeInTheDocument();
    expect(screen.queryByText('Instructor')).not.toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('TA')).toBeInTheDocument(); // another class keeps its own role

    await userEvent.click(screen.getByRole('button', { name: 'Open SE 301 and go to My Project' }));
    expect(setSelectedClass).toHaveBeenCalledWith(mixed[0]);
    expect(screen.getByRole('status')).toHaveTextContent('/app/my-project');
  });
});

describe('My Classes with one role at one school', () => {
  it('looks as before: no role labels, no school headings, Join Class only', () => {
    state.canCreateClasses = false;
    state.classes = [
      { id: 'a', name: 'CSE 115A', created_by: 'prof', created_at: '', status: 'active', my_role: 'student', institution: { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' } },
      { id: 'b', name: 'CSE 115B', created_by: 'prof', created_at: '', status: 'active', my_role: 'student', institution: null },
    ];
    render(<MemoryRouter><MyClasses /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Leave CSE 115A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave CSE 115B' })).toBeInTheDocument();
    expect(screen.queryByText('Student')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join class/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create class/i })).not.toBeInTheDocument();
  });
});

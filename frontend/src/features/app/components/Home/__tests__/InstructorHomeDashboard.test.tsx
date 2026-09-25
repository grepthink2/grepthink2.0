import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

// Stable across renders, as the real provider's are: the dashboard derives its list from them.
const classContext = vi.hoisted(() => ({
  visibleClasses: [
    { id: 'taught', name: 'SE 301', created_by: 'me', created_at: '', status: 'active', my_role: 'instructor', institution: null },
    { id: 'assisted', name: 'CSE 115C', created_by: 'prof', created_at: '', status: 'active', my_role: 'ta', institution: null },
    { id: 'taken', name: 'MATH 19A', created_by: 'prof2', created_at: '', status: 'active', my_role: 'student', institution: null },
  ],
  setSelectedClass: () => {},
  getClassStatus: () => 'active',
}));

vi.mock('@/lib/classContext', () => ({ useClass: () => classContext }));
vi.mock('@/lib/api', () => ({
  api: { getClassesAttentionSummary: vi.fn(() => Promise.resolve({ classes: [] })) },
}));

import InstructorHomeDashboard from '../InstructorHomeDashboard';

describe('InstructorHomeDashboard', () => {
  it('lists only the classes you teach, not the ones you TA or take', async () => {
    render(
      <MemoryRouter>
        <InstructorHomeDashboard />
      </MemoryRouter>,
    );
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open SE 301 dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open CSE 115C dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open MATH 19A dashboard' })).not.toBeInTheDocument();
  });
});

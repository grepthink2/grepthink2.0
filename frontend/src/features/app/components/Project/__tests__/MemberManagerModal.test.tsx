import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ApiProject, ApiStudent } from '@/lib/api';

const students = vi.hoisted((): ApiStudent[] => [
  // An instructor account enrolled in this class as a student.
  { id: 'u1', email: 'prof.lee@ucsc.edu', role: 'instructor', enrollment_role: 'student' },
  { id: 'u2', email: 'kim.ta@ucsc.edu', role: 'student', enrollment_role: 'ta' },
]);
vi.mock('@/lib/api', () => ({
  api: {
    getProjectMembers: vi.fn(() => Promise.resolve({ members: [] })),
    getProjectJoinRequests: vi.fn(() => Promise.resolve({ requests: [] })),
    getClassStudents: vi.fn(() => Promise.resolve({ students })),
    getProjectPendingInvites: vi.fn(() => Promise.resolve({ invites: [] })),
  },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
vi.mock('@/lib/classContext', () => ({ useClassRole: () => 'instructor' }));
vi.mock('@features/messages/components/MessageButton', () => ({ MessageButton: () => null }));

import MemberManagerModal from '../MemberManagerModal';

const project = { id: 'p1', name: 'Team Rocket', team_size: 4 } as ApiProject;

describe('MemberManagerModal — Add Members', () => {
  it('tags each person with their role in the class, not their account role', async () => {
    const user = userEvent.setup();
    render(
      <MemberManagerModal isOpen onClose={() => {}} projectId="p1" classId="c1" project={project} initialMembers={[]} />,
    );
    await user.click(screen.getByRole('button', { name: /add members/i }));

    const card = (email: string) => screen.getByText(email).closest('li') as HTMLElement;
    expect(await screen.findByText('prof.lee@ucsc.edu')).toBeInTheDocument();
    expect(within(card('prof.lee@ucsc.edu')).getByText('Student')).toBeInTheDocument();
    expect(within(card('kim.ta@ucsc.edu')).getByText('TA')).toBeInTheDocument();
    expect(screen.queryByText('instructor')).not.toBeInTheDocument();

    // The search matches the tag shown, not the account role behind it.
    await user.type(screen.getByRole('searchbox', { name: 'Search members' }), 'instructor');
    expect(screen.getByText('No matches for your search.')).toBeInTheDocument();
  });
});

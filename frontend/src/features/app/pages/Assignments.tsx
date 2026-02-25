import React from 'react';
import { useClass } from '@/lib/classContext';
import StudentAssignmentsTable, {
  type StudentAssignment,
} from '../components/Assignments/StudentAssignmentsTable';
import './Assignments.scss';

const mockStudentAssignments: StudentAssignment[] = [
  {
    id: '1',
    name: 'Team Status Report 1',
    dueDate: 'Jan 12, 2026',
    projectName: 'ShoeShopper',
    status: 'not_started',
    action: 'start',
  },
  {
    id: '2',
    name: 'Team Status Report 2',
    dueDate: 'Jan 26, 2026',
    projectName: 'Chatcut',
    status: 'in_progress',
    action: 'edit_submission',
  },
  {
    id: '3',
    name: 'Team Status Report 3',
    dueDate: 'Feb 9, 2026',
    projectName: 'TaskMaster',
    status: 'submitted',
    action: 'closed',
  },
];

const Assignments: React.FC = () => {
  const { selectedClass } = useClass();

  if (!selectedClass) {
    return (
      <div className="assignments">
        <div className="assignments__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view assignments.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="assignments">
      <div className="assignments__content">
        <StudentAssignmentsTable
          assignments={mockStudentAssignments}
          onStart={(assignment: StudentAssignment) => {
            // TODO: hook into assignment start / navigation flow
            // For now, just log so instructors can see in dev tools.
            console.log('Start assignment:', assignment);
          }}
          onEditSubmission={(assignment: StudentAssignment) => {
            // TODO: hook into edit submission flow
            console.log('Edit submission for assignment:', assignment);
          }}
        />
      </div>
    </div>
  );
};

export default Assignments;


import React from 'react';
import { useNavigate } from 'react-router-dom';
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
    type: 'tsrs',
  },
  {
    id: '2',
    name: 'Team Status Report 2',
    dueDate: 'Jan 26, 2026',
    projectName: 'Chatcut',
    status: 'in_progress',
    action: 'edit_submission',
    type: 'tsrs',
  },
  {
    id: '3',
    name: 'Team Status Report 3',
    dueDate: 'Feb 9, 2026',
    projectName: 'TaskMaster',
    status: 'submitted',
    action: 'closed',
    type: 'tsrs',
  },
];

const Assignments: React.FC = () => {
  const { selectedClass } = useClass();
  const navigate = useNavigate();

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

  const handleOpen = (assignment: StudentAssignment) => {
    navigate(`/app/assignments/${assignment.id}`, {
      state: {
        assignmentName: assignment.name,
        assignmentType: assignment.type,
        dueDate: assignment.dueDate,
        projectName: assignment.projectName,
      },
    });
  };

  return (
    <div className="assignments">
      <div className="assignments__content">
        <StudentAssignmentsTable
          assignments={mockStudentAssignments}
          onStart={handleOpen}
          onEditSubmission={handleOpen}
        />
      </div>
    </div>
  );
};

export default Assignments;

import React from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import { useClass } from '@/lib/classContext';
import TSRS from '@features/app/components/TSRS/TSRS';
import type { TsrsAssignment } from '@features/app/components/TSRS/TSRS';
import './AssignmentDetail.scss';

// Supported assignment types — extend here when new types are added.
type AssignmentType = 'tsrs';

interface AssignmentDetailState {
  assignmentName?: string;
  assignmentType?: AssignmentType;
  dueDate?: string;
  projectName?: string;
  projectId?: string;
}

const AssignmentDetail: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const location = useLocation();
  const { selectedClass } = useClass();

  if (!assignmentId) return <Navigate to="/app/assignments" replace />;

  const stateData = (location.state ?? {}) as AssignmentDetailState;

  const assignmentName  = stateData.assignmentName  ?? 'Assignment';
  const assignmentType: AssignmentType = stateData.assignmentType ?? 'tsrs';
  const dueDate         = stateData.dueDate         ?? '';
  const projectName     = stateData.projectName     ?? '';
  const projectId       = stateData.projectId       ?? '';

  if (!selectedClass) {
    return (
      <div className="assignment-detail">
        <div className="assignment-detail__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar.</p>
        </div>
      </div>
    );
  }

  const tsrsAssignment: TsrsAssignment = {
    id: assignmentId,
    name: assignmentName,
    dueDate,
    projectName,
    projectId,
  };

  return (
    <div className="assignment-detail">
      <div className="assignment-detail__body">
        {assignmentType === 'tsrs' && <TSRS assignment={tsrsAssignment} />}
      </div>
    </div>
  );
};

export default AssignmentDetail;

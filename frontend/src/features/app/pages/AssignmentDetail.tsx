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
}

// ── Mock assignment lookup (replace with API call when ready) ───
const MOCK_ASSIGNMENTS: Record<string, { name: string; type: AssignmentType; dueDate: string; projectName: string }> = {
  '1': { name: 'Team Status Report 1', type: 'tsrs', dueDate: 'Jan 12, 2026', projectName: 'ShoeShopper' },
  '2': { name: 'Team Status Report 2', type: 'tsrs', dueDate: 'Jan 26, 2026', projectName: 'Chatcut' },
  '3': { name: 'Team Status Report 3', type: 'tsrs', dueDate: 'Feb 9, 2026',  projectName: 'TaskMaster' },
};

const AssignmentDetail: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const location = useLocation();
  const { selectedClass } = useClass();

  if (!assignmentId) return <Navigate to="/app/assignments" replace />;

  // Prefer data passed via navigation state, fall back to mock lookup
  const stateData = (location.state ?? {}) as AssignmentDetailState;
  const mockData = MOCK_ASSIGNMENTS[assignmentId];

  const assignmentName = stateData.assignmentName ?? mockData?.name ?? 'Assignment';
  const assignmentType: AssignmentType = stateData.assignmentType ?? mockData?.type ?? 'tsrs';
  const dueDate        = stateData.dueDate      ?? mockData?.dueDate      ?? '';
  const projectName    = stateData.projectName  ?? mockData?.projectName  ?? '';

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
  };

  return (
    <div className="assignment-detail">
      <div className="assignment-detail__body">
        {assignmentType === 'tsrs' && <TSRS assignment={tsrsAssignment} />}

        {/* When a new assignment type is added, add a new branch here:
            {assignmentType === 'peer_review' && <PeerReview assignment={...} />} */}
      </div>
    </div>
  );
};

export default AssignmentDetail;

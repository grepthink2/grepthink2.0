import React from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import { useClass } from '@/lib/classContext';
import { useSchoolTimezone } from '@/lib/institutions';
import TSRS from '@features/app/components/TSRS/TSRS';
import type { TsrsAssignment } from '@features/app/components/TSRS/TSRS';
import InterestForm from '@features/app/components/Interest/InterestForm';
import type { InterestFormAssignment } from '@features/app/components/Interest/InterestForm';
import FeedbackForm from '@features/app/components/Feedback/FeedbackForm';
import type { FeedbackFormAssignment } from '@features/app/components/Feedback/FeedbackForm';
import './AssignmentDetail.scss';

// Supported assignment types — extend here when new types are added.
type AssignmentType = 'tsrs' | 'interest_form' | 'feedback';

interface AssignmentDetailState {
  assignmentName?: string;
  assignmentType?: AssignmentType;
  dueDate?: string;
  projectName?: string;
  projectId?: string;
  isSubmitted?: boolean;
  /** The deadline instant (`due_at`), when the backend sent one. */
  dueAt?: string | null;
  /** The open date (YYYY-MM-DD) and the late window's end, for the form's window check. */
  openDate?: string | null;
  acceptUntil?: string | null;
}

const AssignmentDetail: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const location = useLocation();
  const { selectedClass } = useClass();
  const zone = useSchoolTimezone(selectedClass?.institution?.id);

  if (!assignmentId) return <Navigate to="/app/assignments" replace />;

  const stateData = (location.state ?? {}) as AssignmentDetailState;

  const assignmentName  = stateData.assignmentName  ?? 'Assignment';
  const assignmentType: AssignmentType = stateData.assignmentType ?? 'tsrs';
  const dueDate         = stateData.dueDate         ?? '';
  const projectName     = stateData.projectName     ?? '';
  const projectId       = stateData.projectId       ?? '';
  const isSubmitted     = stateData.isSubmitted     ?? false;
  const dueAt           = stateData.dueAt           ?? null;
  const openDate        = stateData.openDate        ?? null;
  const acceptUntil     = stateData.acceptUntil     ?? null;

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
    dueAt,
    openDate,
    acceptUntil,
  };

  const interestAssignment: InterestFormAssignment = {
    id: assignmentId,
    name: assignmentName,
    dueDate,
    classId: selectedClass.id,
  };

  const feedbackAssignment: FeedbackFormAssignment = {
    id: assignmentId,
    name: assignmentName,
    dueDate,
    classId: selectedClass.id,
    dueAt,
    openDate,
    acceptUntil,
  };

  return (
    <div className="assignment-detail">
      <div className="assignment-detail__body">
        {assignmentType === 'tsrs' && <TSRS assignment={tsrsAssignment} zone={zone} />}
        {assignmentType === 'interest_form' && (
          <InterestForm assignment={interestAssignment} />
        )}
        {assignmentType === 'feedback' && (
          <FeedbackForm assignment={feedbackAssignment} isSubmitted={isSubmitted} zone={zone} />
        )}
      </div>
    </div>
  );
};

export default AssignmentDetail;

import React from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useClass } from '@/lib/classContext';
import TSRView from '@features/app/components/TSRS/TSRView';

const TSRViewPage: React.FC = () => {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const { selectedClass } = useClass();

  if (!assignmentId) {
    return <Navigate to="/app/modules" replace />;
  }

  if (!selectedClass) {
    return (
      <div className="tsr-view-page__empty">
        <h2>No Class Selected</h2>
        <p>Please select a class from the sidebar.</p>
      </div>
    );
  }

  return (
    <div className="tsr-view-page">
      <TSRView assignmentId={assignmentId} />
    </div>
  );
};

export default TSRViewPage;

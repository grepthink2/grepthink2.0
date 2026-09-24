import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { ApiAssignment } from '@/lib/api';
import TSRView from '@features/app/components/TSRS/TSRView';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './TAReview.scss';

interface ReviewTargets {
  classId: string;
  assignments: ApiAssignment[];
  projects: { id: string; name: string | null }[];
  /** Set when loading this class's targets failed. */
  error: string | null;
}

const NO_ASSIGNMENTS: ApiAssignment[] = [];
const NO_PROJECTS: ReviewTargets['projects'] = [];

const TAReview: React.FC = () => {
  const { selectedClass } = useClass();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const classId = selectedClass?.id ?? null;
  /** The last review targets loaded, tagged with the class they belong to. */
  const [targets, setTargets] = useState<ReviewTargets | null>(null);
  const current = classId !== null && targets?.classId === classId ? targets : null;
  const loading = classId !== null && current === null;
  const error = current?.error ?? null;
  const assignments = current?.assignments ?? NO_ASSIGNMENTS;
  const projects = current?.projects ?? NO_PROJECTS;

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    api.getTAReviewTargets(classId)
      .then((res) => {
        if (cancelled) return;
        setTargets({
          classId,
          assignments: res.assignments ?? [],
          projects: res.projects ?? [],
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setTargets({
          classId,
          assignments: [],
          projects: [],
          error: err instanceof Error ? err.message : 'Failed to load TA review data',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const selectedAssignmentId = useMemo(() => {
    if (assignmentId && assignments.some((a) => a.id === assignmentId)) {
      return assignmentId;
    }
    return assignments[0]?.id ?? '';
  }, [assignmentId, assignments]);

  const setSelectedAssignment = (id: string) => {
    navigate(id ? `/app/ta-review/${id}` : '/app/ta-review', { replace: true });
  };

  if (!selectedClass) {
    return (
      <div className="ta-review">
        <div className="ta-review__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ta-review" aria-busy="true">
        <header className="ta-review__intro">
          <Skeleton width={160} height={20} />
          <Skeleton width={280} height={13} style={{ marginTop: 8 }} />
        </header>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ta-review">
        <div className="ta-review__empty">
          <h2>Unable to load</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ta-review">
      <header className="ta-review__intro">
        <h2>
          <ClipboardList size={20} /> TA Review
        </h2>
        <p>
          Review TSR responses for the {projects.length}{' '}
          {projects.length === 1 ? 'project' : 'projects'} you oversee in this class.
        </p>
      </header>

      {projects.length === 0 ? (
        <p className="ta-review__hint">
          You have not been assigned to any projects yet. Your instructor assigns the
          projects you oversee.
        </p>
      ) : assignments.length === 0 ? (
        <p className="ta-review__hint">No TSR assignments exist for this class yet.</p>
      ) : (
        <>
          <div className="ta-review__controls">
            <label className="ta-review__control-label" htmlFor="ta-review-assignment">
              TSR Assignment
            </label>
            <select
              id="ta-review-assignment"
              className="ta-review__select"
              value={selectedAssignmentId}
              onChange={(e) => setSelectedAssignment(e.target.value)}
            >
              {assignments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.Title}
                </option>
              ))}
            </select>
          </div>

          {selectedAssignmentId && <TSRView assignmentId={selectedAssignmentId} />}
        </>
      )}
    </div>
  );
};

export default TAReview;

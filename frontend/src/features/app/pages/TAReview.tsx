import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { ApiAssignment } from '@/lib/api';
import TSRView from '@features/app/components/TSRS/TSRView';
import './TAReview.scss';

const TAReview: React.FC = () => {
  const { selectedClass } = useClass();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ApiAssignment[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string | null }[]>([]);

  useEffect(() => {
    if (!selectedClass?.id) {
      setAssignments([]);
      setProjects([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await api.getTAReviewTargets(selectedClass.id);
        if (cancelled) return;
        setAssignments(res.assignments ?? []);
        setProjects(res.projects ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load TA review data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.id]);

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
    return <div className="ta-review"><p className="ta-review__hint">Loading…</p></div>;
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

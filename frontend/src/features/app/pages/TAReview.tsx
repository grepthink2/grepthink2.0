import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { ApiAssignment } from '@/lib/api';
import { formatDeadline, formatInstant, formatInstantIn } from '@/lib/dateUtils';
import { useSchoolTimezone } from '@/lib/institutions';
import { lazyModal } from '@/lib/lazyModal';
import { viewerZone, zoneDiffers, zoneLabel } from '@features/schedule/scheduleModel';
import TSRView from '@features/app/components/TSRS/TSRView';
import { Button } from '@/components/Button/Button';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './TAReview.scss';

// The late window form loads the first time it opens: it brings the date picker.
const LateWindowModal = lazyModal(
  () => import('@features/app/components/TAReview/LateWindowModal'),
  (p) => p.open,
);

interface ReviewTargets {
  classId: string;
  assignments: ApiAssignment[];
  projects: { id: string; name: string | null }[];
  /** The caller may set, move or remove the late window of the class's TSR assignments. */
  canExtend: boolean;
  /** Set when loading this class's targets failed. */
  error: string | null;
}

const NO_ASSIGNMENTS: ApiAssignment[] = [];
const NO_PROJECTS: ReviewTargets['projects'] = [];

/** The deadline as formatDeadline shows it, one minute before `due_at` ("11:59 PM"). */
function shownDeadline(dueAt: string): Date {
  return new Date(new Date(dueAt).getTime() - 60_000);
}

/**
 * " (<campus time> <zone>)" after a time shown in the viewer's zone, when the school's zone differs
 * from the viewer's at that instant (a daylight-saving change can fall between two times); else nothing.
 */
const CampusTime: React.FC<{ at: Date; schoolZone: string }> = ({ at, schoolZone }) =>
  zoneDiffers(viewerZone(), schoolZone, at) ? (
    <span className="ta-review__campus">
      {' '}({formatInstantIn(at, schoolZone)} {zoneLabel(schoolZone, at)})
    </span>
  ) : null;

/**
 * The chosen assignment's deadline and late window: "Deadline <due> · Late submissions until <time>"
 * or "… · No late window", in the viewer's zone, each followed by the campus time when the school's
 * zone differs. An assignment without a deadline shows "Deadline —" alone.
 */
const WindowLine: React.FC<{ assignment: ApiAssignment; schoolZone: string }> = ({ assignment, schoolZone }) => {
  const { due_at: dueAt, accept_until: acceptUntil } = assignment;
  if (!dueAt) return <p className="ta-review__window">Deadline —</p>;
  return (
    <p className="ta-review__window">
      <span>
        Deadline {formatDeadline(assignment)}
        <CampusTime at={shownDeadline(dueAt)} schoolZone={schoolZone} />
      </span>
      {' · '}
      {acceptUntil ? (
        <span>
          Late submissions until {formatInstant(acceptUntil)}
          <CampusTime at={new Date(acceptUntil)} schoolZone={schoolZone} />
        </span>
      ) : (
        <span>No late window</span>
      )}
    </p>
  );
};

const TAReview: React.FC = () => {
  const { selectedClass } = useClass();
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const navigate = useNavigate();
  const schoolZone = useSchoolTimezone(selectedClass?.institution_id ?? selectedClass?.institution?.id);

  const classId = selectedClass?.id ?? null;
  /** The last review targets loaded, tagged with the class they belong to. */
  const [targets, setTargets] = useState<ReviewTargets | null>(null);
  const [lateWindowOpen, setLateWindowOpen] = useState(false);
  const current = classId !== null && targets?.classId === classId ? targets : null;
  const loading = classId !== null && current === null;
  const error = current?.error ?? null;
  const assignments = current?.assignments ?? NO_ASSIGNMENTS;
  const projects = current?.projects ?? NO_PROJECTS;
  const canExtend = current?.canExtend ?? false;

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
          canExtend: res.can_extend_deadlines === true,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setTargets({
          classId,
          assignments: [],
          projects: [],
          canExtend: false,
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
  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId) ?? null;

  const setSelectedAssignment = (id: string) => {
    navigate(id ? `/app/ta-review/${id}` : '/app/ta-review', { replace: true });
  };

  /** A saved or removed late window: the assignment as the server now has it. */
  const replaceAssignment = (updated: ApiAssignment) => {
    setTargets((t) =>
      t ? { ...t, assignments: t.assignments.map((a) => (a.id === updated.id ? updated : a)) } : t,
    );
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

  const hasProjects = projects.length > 0;
  // The late window is class-wide, so a TA who may set it sees the assignments without teams of their own.
  const showAssignments = assignments.length > 0 && (hasProjects || canExtend);
  const noProjectsHint = (
    <p className="ta-review__hint">
      You have not been assigned to any projects yet. Your instructor assigns the
      projects you oversee.
    </p>
  );

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

      {!showAssignments ? (
        hasProjects || canExtend ? (
          <p className="ta-review__hint">No TSR assignments exist for this class yet.</p>
        ) : (
          noProjectsHint
        )
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

          {selectedAssignment && (
            <div className="ta-review__window-row">
              <WindowLine assignment={selectedAssignment} schoolZone={schoolZone} />
              {canExtend && (
                <Button size="sm" variant="outline" onClick={() => setLateWindowOpen(true)}>
                  Accept late submissions…
                </Button>
              )}
            </div>
          )}

          {!hasProjects
            ? noProjectsHint
            : selectedAssignmentId && <TSRView assignmentId={selectedAssignmentId} />}
        </>
      )}

      {canExtend && selectedAssignment && (
        <LateWindowModal
          open={lateWindowOpen}
          assignment={selectedAssignment}
          onClose={() => setLateWindowOpen(false)}
          onSaved={replaceAssignment}
        />
      )}
    </div>
  );
};

export default TAReview;

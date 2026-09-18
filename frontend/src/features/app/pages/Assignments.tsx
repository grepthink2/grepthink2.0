import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { formatAssignmentDueDate } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';
import { useClass } from '@/lib/classContext';
import {
  emptyMySubmissions,
  api,
  type ApiAssignment,
  type ApiMySubmissions,
  type ApiProject,
} from '@/lib/api';
import { usePreview } from '@/lib/previewContext';
import StudentAssignmentsTable, {
  type StudentAssignment,
  type StudentAssignmentAction,
  type StudentAssignmentStatus,
  type AssignmentType,
} from '../components/Assignments/StudentAssignmentsTable';
import { TableSkeleton } from '@/components/Skeleton/TableSkeleton';
import './Assignments.scss';

function resolveAssignmentState(
  openDate: string,
  closeDate: string,
  today: string,
  isSubmitted: boolean,
  canStart: boolean,
): { status: StudentAssignmentStatus; action: StudentAssignmentAction } {
  const status: StudentAssignmentStatus = isSubmitted ? 'submitted' : 'not_started';

  if (today < openDate) {
    return { status, action: 'opens_later' };
  }
  if (closeDate < today) {
    return { status, action: 'closed' };
  }
  if (!canStart) {
    return { status, action: 'closed' };
  }
  if (isSubmitted) {
    return { status: 'submitted', action: 'edit_submission' };
  }
  return { status: 'not_started', action: 'start' };
}

function toStudentRow(
  a: ApiAssignment,
  today: string,
  opts: {
    projectName: string;
    projectId?: string;
    type: AssignmentType;
    isSubmitted: boolean;
    canStart: boolean;
  },
): StudentAssignment {
  const { status, action } = resolveAssignmentState(
    a.open_date,
    a.close_date,
    today,
    opts.isSubmitted,
    opts.canStart,
  );
  return {
    id: a.id,
    name: a.Title,
    dueDate: formatAssignmentDueDate(a.close_date),
    dueDateIso: a.close_date,
    projectName: opts.projectName,
    projectId: opts.projectId,
    status,
    action,
    type: opts.type,
    isSubmitted: opts.isSubmitted,
    openDateIso: action === 'opens_later' ? a.open_date : undefined,
  };
}

interface RowSources {
  today: string;
  /** Sorted by close date. */
  assignments: ApiAssignment[];
  /** The student's teams in this class. */
  myClassProjects: ApiProject[];
  mySubmissions: ApiMySubmissions;
}

function buildRows(
  { today, assignments, myClassProjects, mySubmissions }: RowSources,
  isPreviewing: boolean,
): StudentAssignment[] {
  if (assignments.length === 0) {
    return [];
  }

  if (myClassProjects.length === 0) {
    return assignments.map((a) => {
      const isInterestForm = a.assignment_type === 'interest_form';
      const isFeedback = a.assignment_type === 'feedback';
      const isTsr = !isInterestForm && !isFeedback;
      return toStudentRow(a, today, {
        projectName: isPreviewing && isTsr ? 'Preview Mode' : '—',
        type: isFeedback ? 'feedback' : isInterestForm ? 'interest_form' : 'tsrs',
        isSubmitted: false,
        canStart: isFeedback || isInterestForm || (isPreviewing && isTsr),
      });
    });
  }

  const tsrAssignments = assignments.filter(
    (a) => a.assignment_type !== 'interest_form' && a.assignment_type !== 'feedback',
  );
  const projectIdsByAssignment = new Map<string, (string | null)[]>();
  for (const t of mySubmissions.tsrs) {
    const ids = projectIdsByAssignment.get(t.assignment_id) ?? [];
    ids.push(t.project_id);
    projectIdsByAssignment.set(t.assignment_id, ids);
  }
  const submittedByAssignmentProject: Record<string, Set<string>> = {};
  for (const a of tsrAssignments) {
    const ids = projectIdsByAssignment.get(a.id) ?? [];
    const byProject = new Set(ids.filter((id): id is string => Boolean(id)));
    // Legacy rows carry no project: count them for every team the student is on.
    if (ids.length > 0 && ids.every((id) => !id)) {
      for (const p of myClassProjects) byProject.add(p.id);
    }
    submittedByAssignmentProject[a.id] = byProject;
  }
  const submittedFeedbackIds = new Set(mySubmissions.feedback_assignment_ids);

  const result: StudentAssignment[] = [];
  for (const a of assignments) {
    if (a.assignment_type === 'interest_form') {
      result.push(
        toStudentRow(a, today, {
          projectName: '—',
          type: 'interest_form',
          isSubmitted: false,
          canStart: true,
        }),
      );
      continue;
    }

    if (a.assignment_type === 'feedback') {
      result.push(
        toStudentRow(a, today, {
          projectName: '—',
          type: 'feedback',
          isSubmitted: submittedFeedbackIds.has(a.id),
          canStart: true,
        }),
      );
      continue;
    }

    for (const p of myClassProjects) {
      const isSubmitted = submittedByAssignmentProject[a.id]?.has(p.id) ?? false;
      result.push(
        toStudentRow(a, today, {
          projectName: p.name,
          projectId: p.id,
          type: 'tsrs',
          isSubmitted,
          canStart: true,
        }),
      );
    }
  }

  return result;
}

/**
 * Loads a class's assignments and the student's teams and submissions, and
 * builds the table rows both as a student sees them and as "View as Student"
 * preview shows them, so a bad row still surfaces as a load error.
 */
async function loadRows(classId: string) {
  const today = format(new Date(), 'yyyy-MM-dd');

  const [{ assignments }, { projects: myAllProjects }, { projects: classProjects }, mySubmissions] =
    await Promise.all([
      api.getAssignments(classId),
      api.getProjects(),
      api.getProjects(classId),
      api.getMySubmissions(classId).catch(emptyMySubmissions),
    ]);
  assignments.sort((a, b) => a.close_date.localeCompare(b.close_date));

  const myProjectIds = new Set(myAllProjects.map((p) => p.id));
  const myClassProjects = classProjects.filter((p) => myProjectIds.has(p.id));

  const sources: RowSources = { today, assignments, myClassProjects, mySubmissions };
  return { rows: buildRows(sources, false), previewRows: buildRows(sources, true) };
}

/** The last completed load, and the class it was made for. */
interface RowsLoad {
  classId: string;
  rows: StudentAssignment[];
  previewRows: StudentAssignment[];
  error: string | null;
}

const Assignments: React.FC = () => {
  const { selectedClass } = useClass();
  const { isPreviewing } = usePreview();
  const navigate = useNavigate();
  const classId = selectedClass?.id;
  const [loaded, setLoaded] = useState<RowsLoad | null>(null);

  useEffect(() => {
    if (!classId) return;

    let cancelled = false;

    loadRows(classId).then(
      ({ rows, previewRows }) => {
        if (!cancelled) setLoaded({ classId, rows, previewRows, error: null });
      },
      (e: unknown) => {
        if (!cancelled) {
          setLoaded({
            classId,
            rows: [],
            previewRows: [],
            error: e instanceof Error ? e.message : 'Failed to load assignments',
          });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [classId]);

  // Until a load for this class lands, it is still loading.
  const current = loaded?.classId === classId ? loaded : null;

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
        projectId: assignment.projectId,
        isSubmitted: assignment.isSubmitted,
      },
    });
  };

  if (!current) {
    return (
      <div className="assignments">
        <div className="assignments__content">
          <TableSkeleton
            block="student-assignments"
            title="Assignments"
            headers={['Name', 'Due Date', 'Project Name', 'Status', 'Actions']}
            rows={6}
            cellWidths={['70%', '80px', '60%', '64px', '70px']}
          />
        </div>
      </div>
    );
  }

  if (current.error) {
    return (
      <div className="assignments">
        <div className="assignments__empty">
          <h2>Error</h2>
          <p>{current.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="assignments">
      <div className="assignments__content">
        <StudentAssignmentsTable
          key={selectedClass?.id}
          assignments={isPreviewing ? current.previewRows : current.rows}
          onStart={handleOpen}
          onEditSubmission={handleOpen}
        />
      </div>
    </div>
  );
};

export default Assignments;

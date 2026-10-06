import React, { useState, useEffect, useMemo } from 'react';
import { formatDeadline, formatInstant } from '@/lib/dateUtils';
import { useNavigate } from 'react-router-dom';
import { useClass } from '@/lib/classContext';
import {
  emptyMySubmissions,
  api,
  type ApiAssignment,
  type ApiMySubmissions,
  type ApiProject,
} from '@/lib/api';
import { useSchoolTimezone } from '@/lib/institutions';
import { usePreview } from '@/lib/previewContext';
import StudentAssignmentsTable, {
  type StudentAssignment,
  type AssignmentType,
} from '../components/Assignments/StudentAssignmentsTable';
import { resolveAssignmentState } from '../utils/assignmentState';
import { TableSkeleton } from '@/components/Skeleton/TableSkeleton';
import './Assignments.scss';

function toStudentRow(
  a: ApiAssignment,
  now: Date,
  zone: string,
  opts: {
    projectName: string;
    projectId?: string;
    type: AssignmentType;
    isSubmitted: boolean;
    canStart: boolean;
  },
): StudentAssignment {
  const { status, action, lateUntil } = resolveAssignmentState(
    a,
    now,
    opts.isSubmitted,
    opts.canStart,
    zone,
  );
  return {
    id: a.id,
    name: a.Title,
    dueDate: formatDeadline(a),
    dueDateIso: a.due_at ?? a.close_date,
    dueAt: a.due_at ?? null,
    lateUntil: lateUntil ? formatInstant(lateUntil) : undefined,
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
  /** When the data was read: decides which assignments are open. */
  now: Date;
  /** Sorted by close date. */
  assignments: ApiAssignment[];
  /** The student's teams in this class. */
  myClassProjects: ApiProject[];
  mySubmissions: ApiMySubmissions;
}

function buildRows(
  { now, assignments, myClassProjects, mySubmissions }: RowSources,
  zone: string,
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
      return toStudentRow(a, now, zone, {
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
        toStudentRow(a, now, zone, {
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
        toStudentRow(a, now, zone, {
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
        toStudentRow(a, now, zone, {
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

/** Loads a class's assignments and the student's teams and submissions. */
async function loadRowSources(classId: string): Promise<RowSources> {
  const now = new Date();

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

  return { now, assignments, myClassProjects, mySubmissions };
}

/** The last completed load, and the class it was made for. */
interface SourcesLoad {
  classId: string;
  sources: RowSources | null;
  error: string | null;
}

interface AssignmentTables {
  rows: StudentAssignment[];
  previewRows: StudentAssignment[];
  error: string | null;
}

/**
 * The table rows both as a student sees them and as "View class as student" preview (of a class
 * you teach) shows them, opened in the school's zone. A bad row surfaces as a load error.
 */
function buildTables(load: SourcesLoad, zone: string): AssignmentTables {
  if (!load.sources) return { rows: [], previewRows: [], error: load.error };
  try {
    return {
      rows: buildRows(load.sources, zone, false),
      previewRows: buildRows(load.sources, zone, true),
      error: null,
    };
  } catch (e) {
    return {
      rows: [],
      previewRows: [],
      error: e instanceof Error ? e.message : 'Failed to load assignments',
    };
  }
}

const Assignments: React.FC = () => {
  const { selectedClass } = useClass();
  const zone = useSchoolTimezone(selectedClass?.institution?.id);
  const { isPreviewing } = usePreview();
  const navigate = useNavigate();
  const classId = selectedClass?.id;
  const [loaded, setLoaded] = useState<SourcesLoad | null>(null);

  useEffect(() => {
    if (!classId) return;

    let cancelled = false;

    loadRowSources(classId).then(
      (sources) => {
        if (!cancelled) setLoaded({ classId, sources, error: null });
      },
      (e: unknown) => {
        if (!cancelled) {
          setLoaded({
            classId,
            sources: null,
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
  // Rebuilt without a new load when the school's zone becomes known (Pacific until then).
  const tables = useMemo(() => (current ? buildTables(current, zone) : null), [current, zone]);

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
        dueAt: assignment.dueAt,
      },
    });
  };

  if (!tables) {
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

  if (tables.error) {
    return (
      <div className="assignments">
        <div className="assignments__empty">
          <h2>Error</h2>
          <p>{tables.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="assignments">
      <div className="assignments__content">
        <StudentAssignmentsTable
          key={selectedClass?.id}
          assignments={isPreviewing ? tables.previewRows : tables.rows}
          onStart={handleOpen}
          onEditSubmission={handleOpen}
        />
      </div>
    </div>
  );
};

export default Assignments;

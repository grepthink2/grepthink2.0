import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useClass } from '@/lib/classContext';
import { api, type ApiAssignment } from '@/lib/api';
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
    dueDate: format(parseISO(a.close_date), 'MMM d, yyyy'),
    projectName: opts.projectName,
    projectId: opts.projectId,
    status,
    action,
    type: opts.type,
    isSubmitted: opts.isSubmitted,
    openDateIso: action === 'opens_later' ? a.open_date : undefined,
  };
}

const Assignments: React.FC = () => {
  const { selectedClass } = useClass();
  const navigate = useNavigate();
  const [rows, setRows] = useState<StudentAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedClass) return;

    let cancelled = false;

    const loadAssignments = async () => {
      setLoading(true);
      setError(null);
      try {
        const today = format(new Date(), 'yyyy-MM-dd');

        const { assignments } = await api.getAssignments(selectedClass.id);
        const { projects: myAllProjects } = await api.getProjects();
        const { projects: classProjects } = await api.getProjects(selectedClass.id);

        const myProjectIds = new Set(myAllProjects.map((p) => p.id));
        const myClassProjects = classProjects.filter((p) => myProjectIds.has(p.id));

        if (cancelled) return;

        if (assignments.length === 0) {
          setRows([]);
          return;
        }

        if (myClassProjects.length === 0) {
          const result = assignments.map((a) => {
            const isInterestForm = a.assignment_type === 'interest_form';
            const isFeedback = a.assignment_type === 'feedback';
            return toStudentRow(a, today, {
              projectName: '—',
              type: isFeedback ? 'feedback' : isInterestForm ? 'interest_form' : 'tsrs',
              isSubmitted: false,
              canStart: isFeedback || isInterestForm,
            });
          });
          setRows(result);
          return;
        }

        const tsrAssignments = assignments.filter(
          (a) => a.assignment_type !== 'interest_form' && a.assignment_type !== 'feedback',
        );
        const submittedByAssignmentProject: Record<string, Set<string>> = {};
        await Promise.all(
          tsrAssignments.map(async (a) => {
            try {
              const { tsrs } = await api.getMyAssignmentTsrs(a.id);
              const byProject = new Set<string>();
              const legacyNoProject = tsrs.length > 0 && tsrs.every((t) => !t.project_id);
              for (const t of tsrs) {
                if (t.project_id) byProject.add(t.project_id);
              }
              if (legacyNoProject) {
                for (const p of myClassProjects) byProject.add(p.id);
              }
              submittedByAssignmentProject[a.id] = byProject;
            } catch {
              submittedByAssignmentProject[a.id] = new Set();
            }
          }),
        );

        const feedbackAssignments = assignments.filter(
          (a) => a.assignment_type === 'feedback',
        );
        const submittedFeedbackIds = new Set<string>();
        await Promise.all(
          feedbackAssignments.map(async (a) => {
            try {
              const { submission } = await api.getMyFeedback(a.id);
              if (submission) submittedFeedbackIds.add(a.id);
            } catch {
              // not submitted or error — treat as not started
            }
          }),
        );

        if (cancelled) return;

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

        setRows(result);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load assignments');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAssignments();
    return () => {
      cancelled = true;
    };
  }, [selectedClass?.id]);

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

  if (loading) {
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

  if (error) {
    return (
      <div className="assignments">
        <div className="assignments__empty">
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="assignments">
      <div className="assignments__content">
        <StudentAssignmentsTable
          assignments={rows}
          onStart={handleOpen}
          onEditSubmission={handleOpen}
        />
      </div>
    </div>
  );
};

export default Assignments;

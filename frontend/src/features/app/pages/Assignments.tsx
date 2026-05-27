import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import StudentAssignmentsTable, {
  type StudentAssignment,
  type StudentAssignmentStatus,
  type StudentAssignmentAction,
} from '../components/Assignments/StudentAssignmentsTable';
import './Assignments.scss';

// TODO: remove once the backend supports interest_form assignments
const HARDCODED_INTEREST_FORM: StudentAssignment = {
  id: 'interest-form-preview',
  name: 'Project Interest Form',
  dueDate: 'May 15, 2026',
  projectName: '—',
  status: 'not_started',
  action: 'start',
  type: 'interest_form',
};

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

        // 1. Fetch published assignments for this class
        const { assignments } = await api.getAssignments(selectedClass.id);

        // 2. Fetch all projects the current user is a member of (across all classes)
        const { projects: myAllProjects } = await api.getProjects();

        // 3. Fetch all projects in this class (enrollment-gated on backend)
        const { projects: classProjects } = await api.getProjects(selectedClass.id);

        // 4. Intersect to find "my projects in this class"
        const myProjectIds = new Set(myAllProjects.map((p) => p.id));
        const myClassProjects = classProjects.filter((p) => myProjectIds.has(p.id));

        if (cancelled) return;

        if (assignments.length === 0) {
          setRows([]);
          return;
        }

        if (myClassProjects.length === 0) {
          // Not in any project:
          // - TSR assignments remain closed (requires a project).
          // - Interest form assignments can still be started.
          const result: StudentAssignment[] = assignments.map((a) => {
            const isInterestForm = a.assignment_type === 'interest_form';
            const isPast = a.close_date < today;
            return {
              id: a.id,
              name: a.Title,
              dueDate: format(parseISO(a.close_date), 'MMM d, yyyy'),
              projectName: '—',
              status: 'not_started' as StudentAssignmentStatus,
              action: (
                isPast
                  ? 'closed'
                  : isInterestForm
                    ? 'start'
                    : 'closed'
              ) as StudentAssignmentAction,
              type: isInterestForm ? 'interest_form' : 'tsrs',
            };
          });
          setRows(result);
          return;
        }

        // 5. Fetch existing TSRs for each of my projects in this class
        const tsrsByProject: Record<string, string[]> = {};
        await Promise.all(
          myClassProjects.map(async (p) => {
            try {
              const { tsrs } = await api.getProjectTsrs(p.id);
              tsrsByProject[p.id] = tsrs
                .map((t) => t.assignment_id)
                .filter((id): id is string => Boolean(id));
            } catch {
              tsrsByProject[p.id] = [];
            }
          }),
        );

        if (cancelled) return;

        // 6. Build rows: one per (assignment × my-project) pair
        const result: StudentAssignment[] = [];
        for (const a of assignments) {
          // Interest form is class-level, not per-project.
          if (a.assignment_type === 'interest_form') {
            const isPast = a.close_date < today;
            result.push({
              id: a.id,
              name: a.Title,
              dueDate: format(parseISO(a.close_date), 'MMM d, yyyy'),
              projectName: '—',
              status: 'not_started',
              action: isPast ? 'closed' : 'start',
              type: 'interest_form',
            });
            continue;
          }

          for (const p of myClassProjects) {
            const submittedAssignmentIds = tsrsByProject[p.id] ?? [];
            const isSubmitted = submittedAssignmentIds.includes(a.id);
            const isPast = a.close_date < today;

            let status: StudentAssignmentStatus;
            let action: StudentAssignmentAction;

            if (isPast) {
              status = isSubmitted ? 'submitted' : 'not_started';
              action = 'closed';
            } else if (isSubmitted) {
              status = 'submitted';
              action = 'edit_submission';
            } else {
              status = 'not_started';
              action = 'start';
            }

            result.push({
              id: a.id,
              name: a.Title,
              dueDate: format(parseISO(a.close_date), 'MMM d, yyyy'),
              projectName: p.name,
              projectId: p.id,
              status,
              action,
              type: 'tsrs',
            });
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
      },
    });
  };

  if (loading) {
    return (
      <div className="assignments">
        <div className="assignments__empty">
          <p>Loading assignments…</p>
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
          assignments={[HARDCODED_INTEREST_FORM, ...rows]}
          onStart={handleOpen}
          onEditSubmission={handleOpen}
        />
      </div>
    </div>
  );
};

export default Assignments;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { formatAssignmentDueDate } from '@/lib/dateUtils';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { ApiAssignment } from '@/lib/api';
import AddAssignmentButton from '@features/app/components/Modules/AddAssignmentButton';
import AssignmentList, { type Assignment, type AssignmentStatus } from '@features/app/components/Modules/AssignmentList';
import { TableSkeleton } from '@/components/Skeleton/TableSkeleton';
import AssignmentTurnInRate from '@/features/app/components/Stats/AssignmentTurnInRate';
// import ProjectHealth, { type ProjectHealthItem } from '@/features/app/components/Stats/ProjectHealth';
import { lazyModal } from '@/lib/lazyModal';
import { useClassTurnInStats } from '@features/app/hooks/useClassTurnInStats';
import './Modules.scss';

// Both load on first open; the assignment forms pull in the date picker.
const CreateAssignmentModal = lazyModal(
  () => import('@features/app/components/Modules/CreateAssignmentModal'),
  (p) => p.isOpen,
);
const AssignmentEditorModal = lazyModal(
  () => import('@features/app/components/Modules/AssignmentEditorModal'),
  (p) => p.assignment !== null,
);

// const mockProjectHealth: ProjectHealthItem[] = [
//   {
//     id: '1',
//     name: 'ShoeShopper',
//     health: 'excellent',
//     description: 'Excellent collaboration and progress on schedule',
//     via: 'Team Status Report 1',
//   },
//   {
//     id: '2',
//     name: 'Chatcut',
//     health: 'warning',
//     description: 'Minor disagreements on tech stack decisions',
//     via: 'Team Status Report 1',
//   },
//   {
//     id: '3',
//     name: 'TaskMaster',
//     health: 'poor',
//     description: 'Significant delays and communication breakdowns',
//     via: 'Team Status Report 2',
//   },
// ];

function mapApiAssignment(a: ApiAssignment): Assignment {
  const today = format(new Date(), 'yyyy-MM-dd');
  let status: AssignmentStatus;
  if (a.status === 'draft') {
    status = 'draft';
  } else if (a.close_date < today) {
    status = 'closed';
  } else {
    status = 'active';
  }
  return {
    id: a.id,
    title: a.Title,
    dueDate: formatAssignmentDueDate(a.close_date),
    openDate: `${a.open_date} 00:00`,
    dueDatetime: `${a.close_date} 23:59`,
    submitted: a.assignment_type === 'feedback'
      ? (a.feedback_submitted ?? 0)
      : (a.teams_submitted ?? 0),
    total: a.assignment_type === 'feedback'
      ? (a.feedback_total ?? 0)
      : (a.teams_total ?? 0),
    status,
    assignmentType: a.assignment_type,
    hasTsrResponses: a.has_tsr_responses ?? false,
    hasFeedbackResponses: (a.feedback_submitted ?? 0) > 0,
  };
}

/** A class's assignments, soonest due first, or the message from a failed read. */
async function loadAssignments(
  classId: string,
): Promise<{ assignments: Assignment[] } | { error: string }> {
  try {
    const result = await api.getAssignments(classId);
    return {
      assignments: (result.assignments ?? [])
        .sort((a, b) => a.close_date.localeCompare(b.close_date))
        .map(mapApiAssignment),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Failed to load assignments' };
  }
}

const Modules: React.FC = () => {
  const navigate = useNavigate();
  const { selectedClass } = useClass();
  const classId = selectedClass?.id;
  const { turnInRate, refetch: refetchTurnInStats } = useClassTurnInStats(classId);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(Boolean(classId));
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // A different class starts loading from its first render.
  const [prevClassId, setPrevClassId] = useState(classId);
  if (prevClassId !== classId) {
    setPrevClassId(classId);
    if (classId) {
      setLoading(true);
      setError(null);
    }
  }

  useEffect(() => {
    if (!classId) return;
    let ignore = false;
    void loadAssignments(classId).then((result) => {
      if (ignore) return;
      if ('error' in result) setError(result.error);
      else setAssignments(result.assignments);
      setLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [classId]);

  // Reload after a change, with the skeleton up until the list is back.
  const reloadAssignments = async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    const result = await loadAssignments(classId);
    if ('error' in result) setError(result.error);
    else setAssignments(result.assignments);
    setLoading(false);
  };

  const handleCreateAssignment = async (data: {
    name: string;
    openDate: string;
    dueDate: string;
    template: 'Team Status Report' | 'Project Interest Form' | 'Post Feedback';
    status: 'draft' | 'published';
  }) => {
    if (!selectedClass) return;
    const assignment_type =
      data.template === 'Project Interest Form'
        ? 'interest_form'
        : data.template === 'Post Feedback'
        ? 'feedback'
        : 'tsr';
    await api.createAssignment({
      class_id: selectedClass.id,
      title: data.name,
      open_date: data.openDate.split(' ')[0],
      close_date: data.dueDate.split(' ')[0],
      status: data.status === 'published' ? 'publish' : 'draft',
      assignment_type,
    });
    await reloadAssignments();
    await refetchTurnInStats();
  };

  const handleSaveAssignment = async (
    id: string,
    data: { name: string; openDate: string; dueDate: string; status: 'draft' | 'published' },
  ) => {
    await api.updateAssignment(id, {
      title: data.name,
      open_date: data.openDate.split(' ')[0],
      close_date: data.dueDate.split(' ')[0],
      status: data.status === 'published' ? 'publish' : 'draft',
    });
    await reloadAssignments();
    await refetchTurnInStats();
  };

  const handleDeleteAssignment = async (id: string) => {
    await api.deleteAssignment(id);
    await reloadAssignments();
    await refetchTurnInStats();
    setEditingAssignment(null);
  };

  if (!selectedClass) {
    return (
      <div className="modules">
        <div className="modules__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view modules.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modules">
      <div className="modules__layout">
        {/* ── Left ── */}
        <div className="modules__main">
          <AddAssignmentButton onClick={() => setCreateModalOpen(true)} />
          {loading ? (
            <TableSkeleton
              block="assignment-list"
              title="Assignment Count"
              headers={['Title', 'Due Date', 'Submissions', 'Status', 'Actions']}
              rows={6}
              cellWidths={['70%', '80px', '60%', '64px', '56px']}
            />
          ) : error ? (
            <p className="modules__error">{error}</p>
          ) : (
            <AssignmentList
              assignments={assignments}
              onEdit={setEditingAssignment}
              onViewTsr={(assignment) => {
                if (assignment.assignmentType === 'interest_form' || !assignment.hasTsrResponses) {
                  return;
                }
                navigate(`/app/modules/tsr/${assignment.id}`, {
                  state: { assignmentName: assignment.title },
                });
              }}
              onViewFeedback={(assignment) => {
                if (!assignment.hasFeedbackResponses) return;
                navigate(`/app/modules/feedback/${assignment.id}`, {
                  state: { assignmentName: assignment.title },
                });
              }}
            />
          )}
        </div>

        {/* ── Right ── */}
        <div className="modules__stats">
          <AssignmentTurnInRate data={turnInRate} />
          {/* <ProjectHealth projects={mockProjectHealth} /> */}
          <div className="project-health">
            <h3 className="project-health__heading">Project Health</h3>
            <div className="project-health__coming-soon">
              <p>Coming Soon</p>
            </div>
          </div>
        </div>
      </div>

      <CreateAssignmentModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreateAssignment={handleCreateAssignment}
      />

      <AssignmentEditorModal
        assignment={editingAssignment}
        onClose={() => setEditingAssignment(null)}
        onSave={handleSaveAssignment}
        onDelete={handleDeleteAssignment}
      />
    </div>
  );
};

export default Modules;

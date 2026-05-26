import React, { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { ApiAssignment } from '@/lib/api';
import AddAssignmentButton from '@features/app/components/Modules/AddAssignmentButton';
import AssignmentList, { type Assignment, type AssignmentStatus } from '@features/app/components/Modules/AssignmentList';
import AssignmentTurnInRate from '@/features/app/components/Stats/AssignmentTurnInRate';
import ProjectHealth, { type ProjectHealthItem } from '@/features/app/components/Stats/ProjectHealth';
import CreateAssignmentModal from '@features/app/components/Modules/CreateAssignmentModal';
import AssignmentEditorModal from '@features/app/components/Modules/AssignmentEditorModal';
import { useClassTurnInStats } from '@features/app/hooks/useClassTurnInStats';
import './Modules.scss';

const mockProjectHealth: ProjectHealthItem[] = [
  {
    id: '1',
    name: 'ShoeShopper',
    health: 'excellent',
    description: 'Excellent collaboration and progress on schedule',
    via: 'Team Status Report 1',
  },
  {
    id: '2',
    name: 'Chatcut',
    health: 'warning',
    description: 'Minor disagreements on tech stack decisions',
    via: 'Team Status Report 1',
  },
  {
    id: '3',
    name: 'TaskMaster',
    health: 'poor',
    description: 'Significant delays and communication breakdowns',
    via: 'Team Status Report 2',
  },
];

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
    dueDate: format(parseISO(a.close_date), 'MMM d, yyyy'),
    openDate: `${a.open_date} 00:00`,
    dueDatetime: `${a.close_date} 23:59`,
    submitted: 0,
    total: 0,
    status,
  };
}

const Modules: React.FC = () => {
  const { selectedClass } = useClass();
  const { turnInRate, refetch: refetchTurnInStats } = useClassTurnInStats(selectedClass?.id);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  const fetchAssignments = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAssignments(selectedClass.id);
      setAssignments((result.assignments ?? []).map(mapApiAssignment));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [selectedClass?.id]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleCreateAssignment = async (data: {
    name: string;
    openDate: string;
    dueDate: string;
  }) => {
    if (!selectedClass) return;
    await api.createAssignment({
      class_id: selectedClass.id,
      title: data.name,
      open_date: data.openDate.split(' ')[0],
      close_date: data.dueDate.split(' ')[0],
      status: 'draft',
      assignment_type: 'tsr',
    });
    await fetchAssignments();
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
    await fetchAssignments();
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
            <p className="modules__loading">Loading assignments…</p>
          ) : error ? (
            <p className="modules__error">{error}</p>
          ) : (
            <AssignmentList assignments={assignments} onEdit={setEditingAssignment} />
          )}
        </div>

        {/* ── Right ── */}
        <div className="modules__stats">
          <AssignmentTurnInRate data={turnInRate} />
          <ProjectHealth projects={mockProjectHealth} />
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
      />
    </div>
  );
};

export default Modules;

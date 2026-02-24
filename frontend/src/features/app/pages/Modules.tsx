import React, { useState } from 'react';
import { useClass } from '@/lib/classContext';
import AddAssignmentButton from '@features/app/components/Modules/AddAssignmentButton';
import AssignmentList, { type Assignment } from '@features/app/components/Modules/AssignmentList';
import AssignmentTurnInRate, { type TurnInRateData } from '@features/app/components/Modules/AssignmentTurnInRate';
import ProjectHealth, { type ProjectHealthItem } from '@features/app/components/Modules/ProjectHealth';
import CreateAssignmentModal from '@features/app/components/Modules/CreateAssignmentModal';
import AssignmentEditorModal from '@features/app/components/Modules/AssignmentEditorModal';
import './Modules.scss';

// ── Mock data ─────────────────────────────────────────────────
const mockAssignments: Assignment[] = [
  { id: '1', title: 'Team Status Report 1', dueDate: 'Jan 12, 2026', openDate: '2026-01-05 08:00', dueDatetime: '2026-01-12 23:59', submitted: 18, total: 26, status: 'active' },
  { id: '2', title: 'Team Status Report 2', dueDate: 'Jan 26, 2026', openDate: '2026-01-19 08:00', dueDatetime: '2026-01-26 23:59', submitted: 18, total: 26, status: 'draft' },
  { id: '3', title: 'Team Status Report 3', dueDate: 'Feb 9, 2026',  openDate: '2026-02-02 08:00', dueDatetime: '2026-02-09 23:59', submitted: 18, total: 26, status: 'closed' },
];

const mockTurnInRate: TurnInRateData = {
  rate: 69,
  teamsSubmitted: { count: 18, total: 26 },
  partialSubmissions: { count: 5, total: 26 },
  currentAssignment: 'Team Status Report 1',
  dueDate: 'Jan 30, 2026',
};

const mockProjectHealth: ProjectHealthItem[] = [
  { id: '1', name: 'ShoeShopper', health: 'excellent', description: 'Excellent collaboration and progress on schedule', via: 'Team Status Report 1' },
  { id: '2', name: 'Chatcut', health: 'warning', description: 'Minor disagreements on tech stack decisions', via: 'Team Status Report 1' },
  { id: '3', name: 'TaskMaster', health: 'poor', description: 'Significant delays and communication breakdowns', via: 'Team Status Report 2' },
];

// ── Page ──────────────────────────────────────────────────────
const Modules: React.FC = () => {
  const { selectedClass } = useClass();
  const [createAssignmentModalOpen, setCreateAssignmentModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

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
          <AddAssignmentButton onClick={() => setCreateAssignmentModalOpen(true)} />
          <AssignmentList assignments={mockAssignments} onEdit={setEditingAssignment} />
        </div>

        {/* ── Right ── */}
        <div className="modules__stats">
          <AssignmentTurnInRate data={mockTurnInRate} />
          <ProjectHealth projects={mockProjectHealth} />
        </div>
      </div>

      <CreateAssignmentModal
        isOpen={createAssignmentModalOpen}
        onClose={() => setCreateAssignmentModalOpen(false)}
        onCreateAssignment={(data) => {
          console.log('Create assignment:', data);
        }}
      />

      <AssignmentEditorModal
        assignment={editingAssignment}
        onClose={() => setEditingAssignment(null)}
        onSave={(id, data) => {
          console.log('Save assignment:', id, data);
          setEditingAssignment(null);
        }}
      />
    </div>
  );
};

export default Modules;

import React, { useCallback, useMemo, useState } from 'react';
import { Search, Network } from 'lucide-react';
import type { AssignProject, Student, StudentViewMode } from './assignTypes';
import StudentListItem from './StudentListItem';
import ViewToggle from './ViewToggle';
import { useGlobalDragEnd } from './useGlobalDragEnd';
import { buildWorkWithGroups } from './workWithGroups';
import './StudentsPanel.scss';

function matchesSearch(student: Student, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    student.name.toLowerCase().includes(q) ||
    student.email.toLowerCase().includes(q)
  );
}

interface StudentsPanelProps {
  students: Student[];
  assignedStudentIds: Set<string>;
  /** Maps an assigned student's id to the project they're currently in. */
  studentProjectMap: Map<string, AssignProject>;
  /** Maps a student id to all members of their group (including themselves). */
  groupByStudentId: Map<string, Student[]>;
  /** Whether the currently focused project has room for another student. */
  focusedProjectHasOpenSeat: boolean;
  /** Called when an assigned student is dragged back into this panel. */
  onReturnStudent: (studentId: string) => void;
  /** Called to directly place a student into the focused project's first open seat. */
  onQuickAdd: (studentId: string) => void;
}

const StudentsPanel: React.FC<StudentsPanelProps> = ({
  students,
  assignedStudentIds,
  studentProjectMap,
  groupByStudentId,
  focusedProjectHasOpenSeat,
  onReturnStudent,
  onQuickAdd,
}) => {
  const [view, setView] = useState<StudentViewMode>('list');
  const [query, setQuery] = useState('');
  const [dragOver, setDragOver] = useState(false);
  useGlobalDragEnd(useCallback(() => setDragOver(false), []));

  const studentsById = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  const { leaderIds, nestedByLeaderId } = useMemo(
    () => buildWorkWithGroups(students),
    [students],
  );

  const visibleStudents = useMemo(() => {
    const searching = query.trim().length > 0;
    return students
      .filter((s) => leaderIds.has(s.id))
      .filter((leader) => {
        if (!searching) return true;
        if (matchesSearch(leader, query)) return true;
        const nestedIds = nestedByLeaderId.get(leader.id) ?? [];
        return nestedIds.some((id) => {
          const nested = studentsById.get(id);
          return nested ? matchesSearch(nested, query) : false;
        });
      });
  }, [students, leaderIds, nestedByLeaderId, studentsById, query]);

  const handleDragStart = (e: React.DragEvent, studentId: string) => {
    e.dataTransfer.setData('text/plain', studentId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleListDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleListDragLeave = (e: React.DragEvent) => {
    // Ignore transitions between children — only clear on leaving the wrapper.
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };

  const handleListDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const studentId = e.dataTransfer.getData('text/plain');
    if (studentId) onReturnStudent(studentId);
  };

  return (
    <section className="students-panel">
      <div className="students-panel__header">
        <h2 className="students-panel__title">Available Students</h2>
        <ViewToggle value={view} onChange={setView} />
      </div>

      {view === 'list' ? (
        <>
          <div className="students-panel__search">
            <Search size={16} className="students-panel__search-icon" />
            <input
              className="students-panel__search-input"
              type="text"
              placeholder="Search students..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div
            className={`students-panel__list${
              dragOver ? ' students-panel__list--drag-over' : ''
            }`}
            onDragOver={handleListDragOver}
            onDragLeave={handleListDragLeave}
            onDrop={handleListDrop}
          >
            {visibleStudents.map((student) => {
              const isAssigned = assignedStudentIds.has(student.id);
              const assignedProject = studentProjectMap.get(student.id) ?? null;
              const groupMembers = groupByStudentId.get(student.id) ?? [];
              const nestedIds = nestedByLeaderId.get(student.id) ?? [];
              const searching = query.trim().length > 0;
              const teammates = nestedIds
                .map((id) => studentsById.get(id))
                .filter((t): t is Student => {
                  if (!t) return false;
                  if (!searching) return true;
                  if (matchesSearch(student, query)) return true;
                  return matchesSearch(t, query);
                });
              return (
                <StudentListItem
                  key={student.id}
                  student={student}
                  teammates={teammates}
                  groupMembers={groupMembers}
                  assignedProject={assignedProject}
                  canQuickAdd={!isAssigned && focusedProjectHasOpenSeat}
                  onQuickAdd={onQuickAdd}
                  onDragStart={handleDragStart}
                  studentProjectMap={studentProjectMap}
                  focusedProjectHasOpenSeat={focusedProjectHasOpenSeat}
                  assignedStudentIds={assignedStudentIds}
                />
              );
            })}
            {visibleStudents.length === 0 && (
              <div className="students-panel__empty">
                {query
                  ? 'No students match your search.'
                  : 'All students are assigned.'}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="students-panel__graph-empty">
          <div className="students-panel__graph-icon">
            <Network size={48} strokeWidth={1.5} />
          </div>
          <h3 className="students-panel__graph-title">3D Graph View</h3>
          <p className="students-panel__graph-subtitle">Coming soon</p>
        </div>
      )}
    </section>
  );
};

export default StudentsPanel;

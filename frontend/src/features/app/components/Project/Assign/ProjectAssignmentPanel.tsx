import React, { useCallback, useMemo, useState } from 'react';
import type { AssignProject, Student } from './assignTypes';
import ProjectSearchBar from './ProjectSearchBar';
import FocusedProjectCard from './FocusedProjectCard';
import StudentDropSlot from './StudentDropSlot';
import { useGlobalDragEnd } from './useGlobalDragEnd';
import './ProjectAssignmentPanel.scss';

interface ProjectAssignmentPanelProps {
  projects: AssignProject[];
  students: Student[];
  /** Maps a student id to all members of their group (including themselves). */
  groupByStudentId: Map<string, Student[]>;
  focusedProject: AssignProject | null;
  /** Ordered student IDs (or null) for each slot of the focused project. */
  slotAssignments: (string | null)[];
  onSelectProject: (project: AssignProject) => void;
  onAddSeat: () => void;
  onRemoveSeat: () => void;
  onAssignStudent: (projectId: string, slotIndex: number, studentId: string) => void;
  onAssignToFirstEmpty: (studentId: string) => void;
  onUnassignStudent: (projectId: string, slotIndex: number) => void;
}

const ProjectAssignmentPanel: React.FC<ProjectAssignmentPanelProps> = ({
  projects,
  students,
  groupByStudentId,
  focusedProject,
  slotAssignments,
  onSelectProject,
  onAddSeat,
  onRemoveSeat,
  onAssignStudent,
  onAssignToFirstEmpty,
  onUnassignStudent,
}) => {
  const [sectionDragOver, setSectionDragOver] = useState(false);
  useGlobalDragEnd(useCallback(() => setSectionDragOver(false), []));
  const studentsById = useMemo(() => {
    const map = new Map<string, Student>();
    students.forEach((s) => map.set(s.id, s));
    return map;
  }, [students]);

  const openSeatCount = focusedProject
    ? Math.max(focusedProject.totalSeats - focusedProject.seatsTaken, 0)
    : 0;

  const handleSectionDragOver = (e: React.DragEvent) => {
    if (openSeatCount === 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setSectionDragOver(true);
  };

  const handleSectionDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setSectionDragOver(false);
  };

  const handleSectionDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setSectionDragOver(false);
    if (openSeatCount === 0) return;
    const studentId = e.dataTransfer.getData('text/plain');
    if (studentId) onAssignToFirstEmpty(studentId);
  };

  return (
    <section className="assignment-panel">
      <div className="assignment-panel__header">
        <h2 className="assignment-panel__title">Project Assignment</h2>
      </div>

      <ProjectSearchBar
        projects={projects}
        focusedProjectId={focusedProject?.id ?? null}
        onSelect={onSelectProject}
      />

      {focusedProject ? (
        <>
          <FocusedProjectCard
            project={focusedProject}
            onAddSeat={onAddSeat}
            onRemoveSeat={onRemoveSeat}
          />

          <div
            className={`assignment-panel__slots${
              sectionDragOver ? ' assignment-panel__slots--drag-over' : ''
            }`}
            onDragOver={handleSectionDragOver}
            onDragLeave={handleSectionDragLeave}
            onDrop={handleSectionDrop}
          >
            {Array.from({ length: focusedProject.totalSeats }).map((_, i) => {
              const studentId = slotAssignments[i] ?? null;
              const student = studentId ? studentsById.get(studentId) ?? null : null;
              const groupMembers = student
                ? (groupByStudentId.get(student.id) ?? [])
                : [];
              return (
                <StudentDropSlot
                  key={i}
                  index={i + 1}
                  assignedStudent={student}
                  groupMembers={groupMembers}
                  onDrop={(droppedId) => {
                    // Clear the section highlight even though the child
                    // slot's drop event stops propagation.
                    setSectionDragOver(false);
                    onAssignStudent(focusedProject.id, i, droppedId);
                  }}
                  onRemove={() => onUnassignStudent(focusedProject.id, i)}
                />
              );
            })}
          </div>

          <div className="assignment-panel__footer">
            {openSeatCount} open {openSeatCount === 1 ? 'seat' : 'seats'}
          </div>
        </>
      ) : (
        <div className="assignment-panel__empty">
          Select a project above to start assigning students.
        </div>
      )}
    </section>
  );
};

export default ProjectAssignmentPanel;

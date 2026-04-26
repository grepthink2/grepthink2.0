import React, { useState } from 'react';
import {
  ChevronRight,
  Heart,
  CheckCircle,
  Users,
  UserPlus,
  FolderOpen,
} from 'lucide-react';
import type { AssignProject, Student } from './assignTypes';
import StudentDetails from './StudentDetails';
import GroupTooltip from './GroupTooltip';
import './StudentListItem.scss';

interface StudentListItemProps {
  student: Student;
  /** Teammates that indicated they want to work with this student as leader (controls nested tree). */
  teammates?: Student[];
  /** All members of this student's group (including themselves). Controls the group badge. */
  groupMembers?: Student[];
  /** Handler invoked when a drag starts on this student (or a nested teammate). */
  onDragStart?: (e: React.DragEvent, studentId: string) => void;
  /** If set, the student is currently assigned to this project. */
  assignedProject?: AssignProject | null;
  /** Whether the quick-add button should render for this student. */
  canQuickAdd?: boolean;
  /** Adds the student to the currently focused project's first open seat. */
  onQuickAdd?: (studentId: string) => void;
  /** Maps student id → currently assigned project. Used to render nested teammates as ghosts. */
  studentProjectMap?: Map<string, AssignProject>;
  /** Whether the focused project has a free seat. Threaded through to nested teammates. */
  focusedProjectHasOpenSeat?: boolean;
  /** Set of all assigned student ids. Threaded through to nested teammates. */
  assignedStudentIds?: Set<string>;
}

const StudentListItem: React.FC<StudentListItemProps> = ({
  student,
  teammates,
  groupMembers = [],
  onDragStart,
  assignedProject,
  canQuickAdd = false,
  onQuickAdd,
  studentProjectMap,
  focusedProjectHasOpenSeat,
  assignedStudentIds,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const hasTeammates = (teammates?.length ?? 0) > 0;
  const isAssigned = Boolean(assignedProject);
  const draggable = Boolean(onDragStart) && !isAssigned;
  // Group = every member except this student.
  const groupOthers = groupMembers.filter((m) => m.id !== student.id);

  const handleDragStart = (e: React.DragEvent) => {
    if (!onDragStart) return;
    onDragStart(e, student.id);
    setDragging(true);
  };

  return (
    <div className="student-item-wrapper">
      <div
        className={`student-item${expanded ? ' student-item--open' : ''}${
          dragging ? ' student-item--dragging' : ''
        }${isAssigned ? ' student-item--assigned' : ''}`}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={() => setDragging(false)}
      >
        <div className="student-item__head">
          <button
            type="button"
            className="student-item__row"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <ChevronRight
              size={16}
              className={`student-item__chevron${
                expanded ? ' student-item__chevron--open' : ''
              }`}
            />

            <div className="student-item__identity">
              <div className="student-item__name">{student.name}</div>
              <div className="student-item__email">{student.email}</div>
            </div>

            <div className="student-item__stats">
              {isAssigned && assignedProject ? (
                <span
                  className="student-item__stat student-item__stat--assigned"
                  title={`Currently on ${assignedProject.name}`}
                >
                  <FolderOpen size={14} className="student-item__stat-icon" />
                  {assignedProject.name}
                </span>
              ) : (
                <>
                  <span className="student-item__stat student-item__stat--interest">
                    <Heart size={14} className="student-item__stat-icon" />
                    {student.interest.forFocusedProject}/5
                  </span>
                  <span className="student-item__stat student-item__stat--matches">
                    <CheckCircle size={14} className="student-item__stat-icon" />
                    {student.interest.availableMatches}
                  </span>
                </>
              )}
              {groupOthers.length > 0 && (
                <GroupTooltip members={groupMembers} selfId={student.id}>
                  <span className="student-item__stat student-item__stat--team">
                    <Users size={14} className="student-item__stat-icon" />
                    {groupOthers.length}
                  </span>
                </GroupTooltip>
              )}
            </div>
          </button>

          {canQuickAdd && onQuickAdd && !isAssigned && (
            <button
              type="button"
              className="student-item__quick-add"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAdd(student.id);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              draggable={false}
              title="Add to focused project"
              aria-label={`Add ${student.name} to focused project`}
            >
              <UserPlus size={14} />
            </button>
          )}
        </div>

        {expanded && <StudentDetails student={student} />}
      </div>

      {hasTeammates && (
        <div className="student-item__teammates">
          {teammates!.map((teammate) => {
            const teammateAssigned =
              assignedStudentIds?.has(teammate.id) ?? false;
            const teammateProject =
              studentProjectMap?.get(teammate.id) ?? null;
            return (
              <div
                key={teammate.id}
                className="student-item__teammate-connector"
              >
                <StudentListItem
                  student={teammate}
                  groupMembers={groupMembers}
                  onDragStart={onDragStart}
                  assignedProject={teammateProject}
                  canQuickAdd={
                    !teammateAssigned && (focusedProjectHasOpenSeat ?? false)
                  }
                  onQuickAdd={onQuickAdd}
                  studentProjectMap={studentProjectMap}
                  focusedProjectHasOpenSeat={focusedProjectHasOpenSeat}
                  assignedStudentIds={assignedStudentIds}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentListItem;

import React, { useCallback, useState } from 'react';
import { UserPlus, X, GripVertical, Users } from 'lucide-react';
import type { Student } from './assignTypes';
import { useGlobalDragEnd } from './useGlobalDragEnd';
import GroupTooltip from './GroupTooltip';
import './StudentDropSlot.scss';

interface StudentDropSlotProps {
  index: number;
  assignedStudent: Student | null;
  /** All members of the assigned student's group (including themselves). */
  groupMembers?: Student[];
  onDrop: (studentId: string) => void;
  onRemove: () => void;
}

const StudentDropSlot: React.FC<StudentDropSlotProps> = ({
  index,
  assignedStudent,
  groupMembers = [],
  onDrop,
  onRemove,
}) => {
  const groupOthers = groupMembers.filter((m) => m.id !== assignedStudent?.id);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);

  useGlobalDragEnd(
    useCallback(() => {
      setDragOver(false);
      setDragging(false);
    }, []),
  );

  const handleDragOver = (e: React.DragEvent) => {
    if (assignedStudent) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDropEvent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (assignedStudent) return;
    const studentId = e.dataTransfer.getData('text/plain');
    if (studentId) onDrop(studentId);
  };

  const handleAssignedDragStart = (e: React.DragEvent) => {
    if (!assignedStudent) return;
    e.dataTransfer.setData('text/plain', assignedStudent.id);
    e.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  };

  return (
    <div className="drop-slot">
      <span className="drop-slot__index">{index}</span>

      {assignedStudent ? (
        <div
          className={`drop-slot__assigned${
            dragging ? ' drop-slot__assigned--dragging' : ''
          }`}
          draggable
          onDragStart={handleAssignedDragStart}
          onDragEnd={() => setDragging(false)}
        >
          <GripVertical size={16} className="drop-slot__grip" />
          <div className="drop-slot__identity">
            <span className="drop-slot__name">{assignedStudent.name}</span>
            <span className="drop-slot__email">{assignedStudent.email}</span>
          </div>
          {groupOthers.length > 0 && (
            <GroupTooltip members={groupMembers} selfId={assignedStudent.id}>
              <span className="drop-slot__group-badge">
                <Users size={13} />
                {groupOthers.length}
              </span>
            </GroupTooltip>
          )}
          <button
            type="button"
            className="drop-slot__remove"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            draggable={false}
            aria-label={`Remove ${assignedStudent.name} from this slot`}
            title="Remove from slot"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <div
          className={`drop-slot__placeholder${
            dragOver ? ' drop-slot__placeholder--drag-over' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDropEvent}
        >
          <UserPlus size={16} />
          <span>Drag a student here</span>
        </div>
      )}
    </div>
  );
};

export default StudentDropSlot;

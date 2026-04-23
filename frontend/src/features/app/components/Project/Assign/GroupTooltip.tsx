import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Student } from './assignTypes';
import './GroupTooltip.scss';

interface GroupTooltipProps {
  /** All members of the group, including the subject student (usually rendered bold). */
  members: Student[];
  /** ID of the student this tooltip is anchored to (shown highlighted in the list). */
  selfId: string;
  /** The trigger element (typically a badge). */
  children: React.ReactNode;
}

/**
 * Hover tooltip listing every member of a student's group. Rendered via a
 * portal so it's never clipped by scroll containers or overflow ancestors.
 */
const GroupTooltip: React.FC<GroupTooltipProps> = ({
  members,
  selfId,
  children,
}) => {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!visible || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setCoords({
      top: rect.top,
      left: rect.left + rect.width / 2,
    });
  }, [visible]);

  return (
    <span
      ref={triggerRef}
      className="group-tooltip__trigger"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible &&
        createPortal(
          <div
            className="group-tooltip"
            style={{ top: coords.top, left: coords.left }}
            role="tooltip"
          >
            <div className="group-tooltip__title">Group</div>
            {members.map((m) => (
              <div
                key={m.id}
                className={`group-tooltip__member${
                  m.id === selfId ? ' group-tooltip__member--self' : ''
                }`}
              >
                {m.name}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </span>
  );
};

export default GroupTooltip;

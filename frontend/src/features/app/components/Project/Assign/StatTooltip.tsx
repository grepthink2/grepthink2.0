import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './StatTooltip.scss';

interface StatTooltipProps {
  label: string;
  children: React.ReactNode;
  underline?: boolean;
}

/**
 * Lightweight single-label hover tooltip rendered via a portal so it is
 * never clipped by scroll containers or overflow ancestors.
 */
const StatTooltip: React.FC<StatTooltipProps> = ({ label, children, underline = false }) => {
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
      className={`stat-tooltip__trigger${underline ? ' stat-tooltip__trigger--underline' : ''}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible &&
        createPortal(
          <div
            className="stat-tooltip"
            style={{ top: coords.top, left: coords.left }}
            role="tooltip"
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
};

export default StatTooltip;

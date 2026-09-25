import React from 'react';

interface StageCardProps {
  /** Classes that place, size and tilt the card; each stage's stylesheet defines them. */
  className: string;
  /** Position in the reveal sequence; each step starts 80ms later. */
  order: number;
  children: React.ReactNode;
}

/** One floating card on a spotlight stage, in the hero's card shell. */
const StageCard: React.FC<StageCardProps> = ({ className, order, children }) => (
  <div
    className={`stage-card ${className}`}
    style={{ '--reveal-order': order } as React.CSSProperties}
  >
    {children}
  </div>
);

export default StageCard;

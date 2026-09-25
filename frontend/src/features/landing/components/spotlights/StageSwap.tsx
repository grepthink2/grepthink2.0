import React from 'react';

interface StageSwapProps {
  before: React.ReactNode;
  after: React.ReactNode;
  className?: string;
}

/**
 * Two stacked values that trade places during a band's moment: `before` shows until the swap,
 * `after` from then on. `after` is also the still frame for reduced motion.
 */
const StageSwap: React.FC<StageSwapProps> = ({ before, after, className = '' }) => (
  <span className={`stage-swap ${className}`.trim()}>
    <span className="stage-swap__before">{before}</span>
    <span className="stage-swap__after">{after}</span>
  </span>
);

export default StageSwap;

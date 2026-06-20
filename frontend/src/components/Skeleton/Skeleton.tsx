import React from 'react';
import './Skeleton.scss';

interface SkeletonProps {
  /** CSS width (e.g. '100%', 120, '6rem'). Defaults to '100%'. */
  width?: number | string;
  /** CSS height (e.g. 12, '1rem'). Defaults to '1em'. */
  height?: number | string;
  /** Border radius override (e.g. 8, '50%'). */
  radius?: number | string;
  /** Render a circle (avatar placeholder). Sets radius 50% and squares the box to `width`. */
  circle?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Single shimmering placeholder block — the atom every per-view skeleton
 * composes. Purely decorative, so it is hidden from assistive tech; mark the
 * surrounding loading region with `aria-busy="true"` instead.
 */
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1em',
  radius,
  circle = false,
  className,
  style,
}) => {
  const resolvedRadius = circle ? '50%' : radius;
  return (
    <span
      className={`skeleton${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      style={{
        width: circle ? height : width,
        height,
        ...(resolvedRadius !== undefined ? { borderRadius: resolvedRadius } : {}),
        ...style,
      }}
    />
  );
};

export default Skeleton;

import * as React from 'react';
export interface ArrowProps {
  className?: string;
  style?: React.CSSProperties;
  direction?: "up" | "down" | "left" | "right";
  variant?: "pixelised" | "antialias";
}
export declare const Arrow: React.FC<ArrowProps>;
export default Arrow;

import * as React from 'react';
export interface GridProps {
  className?: string;
  style?: React.CSSProperties;
  size?: "20" | "24" | "32" | "40" | "48" | "16";
}
export declare const Grid: React.FC<GridProps>;
export default Grid;

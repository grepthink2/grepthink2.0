import * as React from 'react';
export interface ScrollbarProps {
  className?: string;
  style?: React.CSSProperties;
  oS?: "windows" | "mac";
  horizontal?: boolean;
  position?: "start" | "middle" | "end" | "free";
  /** Swappable nested instance; defaults to the design's. */
  icon1?: React.ReactNode;
  /** Swappable nested instance; defaults to the design's. */
  icon2?: React.ReactNode;
  /** Swappable nested instance; defaults to the design's. */
  icon3?: React.ReactNode;
  /** Swappable nested instance; defaults to the design's. */
  icon4?: React.ReactNode;
}
export declare const Scrollbar: React.FC<ScrollbarProps>;
export default Scrollbar;

import * as React from 'react';
export interface DateActiveProps {
  className?: string;
  style?: React.CSSProperties;
  /** Swappable nested instance; defaults to the design's. */
  icon1?: React.ReactNode;
}
export declare const DateActive: React.FC<DateActiveProps>;
export default DateActive;

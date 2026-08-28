import * as React from 'react';
export interface MonthProps {
  className?: string;
  style?: React.CSSProperties;
  /** Text content; defaults to "SAT". */
  text1?: string;
}
export declare const Month: React.FC<MonthProps>;
export default Month;

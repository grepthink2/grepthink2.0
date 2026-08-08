import * as React from 'react';
export interface ThumbProps {
  className?: string;
  style?: React.CSSProperties;
  horizontal?: boolean;
  oS?: "windows" | "mac";
  hidden?: boolean;
  /** Text content; defaults to ".. ....................". */
  text1?: string;
}
export declare const Thumb: React.FC<ThumbProps>;
export default Thumb;

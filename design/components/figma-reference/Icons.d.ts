import * as React from 'react';
export interface IconsProps {
  className?: string;
  style?: React.CSSProperties;
  icon?: "check-bold" | "dots-vertical" | "close" | "arrow-down" | "arrow-up" | "arrow-left" | "arrow-right" | "download";
}
export declare const Icons: React.FC<IconsProps>;
export default Icons;

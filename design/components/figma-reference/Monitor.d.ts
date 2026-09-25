import * as React from 'react';
export interface MonitorProps {
  className?: string;
  style?: React.CSSProperties;
  size?: "20" | "24" | "32" | "40" | "48" | "16";
}
export declare const Monitor: React.FC<MonitorProps>;
export default Monitor;

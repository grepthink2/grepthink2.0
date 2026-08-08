import * as React from 'react';
export interface ToggleSwitchProps {
  className?: string;
  style?: React.CSSProperties;
  showAXLabel?: boolean;
  state?: "off" | "on";
}
export declare const ToggleSwitch: React.FC<ToggleSwitchProps>;
export default ToggleSwitch;

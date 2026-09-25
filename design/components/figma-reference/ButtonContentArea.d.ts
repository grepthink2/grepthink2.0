import * as React from 'react';
export interface ButtonContentAreaProps {
  className?: string;
  style?: React.CSSProperties;
  label?: string;
  symbol?: string;
  size?: "sm" | "md" | "lg";
  style2?: "bordered - prominent" | "bordered" | "bordered - secondary" | "borderless";
  labelType?: "symbol + text" | "symbol" | "text";
  enabled?: boolean;
  destructive?: boolean;
}
export declare const ButtonContentArea: React.FC<ButtonContentAreaProps>;
export default ButtonContentArea;

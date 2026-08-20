import * as React from 'react';

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: React.ReactNode;
  /** Muted centered line under the title. */
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** Action row at the bottom. */
  footer?: React.ReactNode;
  /** Max width in px. @default 500 */
  width?: number;
  /** Blocks Esc/backdrop/× while a request is in flight. @default false */
  closeDisabled?: boolean;
}

export function Modal(props: ModalProps): React.JSX.Element | null;

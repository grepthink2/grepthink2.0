import * as React from 'react';

export interface FeatureColumnProps {
  /** 20px Lucide icon for the green tile. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export interface PreviewWindowProps {
  /** Screenshot URL (1512×797; the frame shows the top 560/640/760px by breakpoint). */
  src: string;
  /** @default 'grepthink app preview' */
  alt?: string;
  /** Show the whole image without the bottom fade. @default false */
  unmasked?: boolean;
  className?: string;
}

export function FeatureColumn(props: FeatureColumnProps): React.JSX.Element;
export function PreviewWindow(props: PreviewWindowProps): React.JSX.Element;

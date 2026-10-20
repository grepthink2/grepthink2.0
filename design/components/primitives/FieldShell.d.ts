import * as React from 'react';

export interface FieldShellContext {
  /** id for the control (`htmlFor` target). */
  id: string;
  /** id of the label element (use with `aria-labelledby` in `group` mode). */
  labelId: string;
  /** Space-separated ids of the error / help / counter lines — pass to `aria-describedby`. */
  describedBy?: string;
  /** True when `error` is set or the text is over `max` — pass to `aria-invalid`. */
  invalid: boolean;
}

export interface FieldShellProps {
  id?: string;
  label?: React.ReactNode;
  /** Keep the label for screen readers but hide it visually (search boxes, inline editors). A placeholder is never the label. @default false */
  hideLabel?: boolean;
  /** Shows a quiet "(optional)" after the label. Required fields carry no visible mark. @default false */
  optional?: boolean;
  helperText?: React.ReactNode;
  /** Replaces the help line; sets the error treatment. */
  error?: React.ReactNode;
  /** Current length, for the counter. */
  count?: number;
  /** Soft limit: shows "count / max"; past it the field is flagged, never truncated. */
  max?: number;
  disabled?: boolean;
  /** Render the label as a <span> for a control group labelled with `aria-labelledby` (CodeInput, FileUpload). @default false */
  group?: boolean;
  className?: string;
  children: React.ReactNode | ((ctx: FieldShellContext) => React.ReactNode);
}

/**
 * Label, control slot, help / error line and counter — the `.gt-field` shell every form control shares.
 */
export function FieldShell(props: FieldShellProps): React.JSX.Element;

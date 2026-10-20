import * as React from 'react';

export interface MarkdownEditorProps {
  id?: string;
  label: React.ReactNode;
  /** @default false */
  hideLabel?: boolean;
  /** Markdown source. */
  value?: string;
  /** Receives the new source string (typing and toolbar edits). */
  onChange?: (value: string) => void;
  placeholder?: string;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  /** @default false */
  optional?: boolean;
  /** Soft limit with the shared "n / max" counter. */
  maxLength?: number;
  /** @default 6 */
  rows?: number;
  disabled?: boolean;
  /** Preview renderer — pass the codebase's `<MarkdownText>` (GFM). Defaults to a small safe renderer. */
  renderPreview?: (value: string) => React.ReactNode;
  /** Show the formatting toolbar in Write mode. @default true */
  toolbar?: boolean;
  className?: string;
}

/** Write / Preview Markdown field with a formatting toolbar and counter. */
export function MarkdownEditor(props: MarkdownEditorProps): React.JSX.Element;
/** Design-side preview renderer (paragraphs, lists, bold, italic, code, http(s) / mailto links). */
export function renderMarkdownLite(src: string): React.ReactNode[];

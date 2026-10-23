// Intentional addition: Markdown, MarkdownText — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface MarkdownTextProps {
  /** Markdown source. */
  children: string;
  /** Team member names — @mentions matching one render as mention chips. */
  members?: string[];
  className?: string;
}

/** Markdown renderer (`.gt-md`): the codebase's `components/Markdown/MarkdownText` (GFM); the design side renders a small safe subset. */
export function MarkdownText(props: MarkdownTextProps): React.JSX.Element;
/** The renderer under the file's name, for the bundle (design-only, like ModKey): the file is `Markdown.jsx` after the codebase's `components/Markdown/`. */
export const Markdown: { MarkdownText: typeof MarkdownText };

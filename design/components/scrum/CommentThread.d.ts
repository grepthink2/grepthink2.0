import * as React from 'react';

export interface ScrumComment {
  author: string;
  /** Relative time ("2h ago"). */
  time?: string;
  /** Markdown body (bold, italic, code, links, - lists, @mentions). */
  body: string;
}

export interface MarkdownTextProps {
  /** Markdown source. */
  children: string;
  /** Team member names — @mentions matching one render as mention chips. */
  members?: string[];
  className?: string;
}

export interface CommentThreadProps {
  comments: ScrumComment[];
  /** Project-team members available for @mention. */
  members?: string[];
  /** Composer draft (controlled). */
  value: string;
  onChange?: (value: string) => void;
  /** Called with the trimmed draft (also ⌘/Ctrl+Enter). */
  onSubmit?: (body: string) => void;
  placeholder?: string;
  className?: string;
}

/** Demo-fidelity markdown renderer (production uses the codebase's md + mention semantics). */
export function MarkdownText(props: MarkdownTextProps): React.JSX.Element;
/** Story/task comment thread with markdown + @mentions. */
export function CommentThread(props: CommentThreadProps): React.JSX.Element;

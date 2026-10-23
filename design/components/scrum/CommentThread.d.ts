// Intentional addition: CommentThread — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface ScrumComment {
  author: string;
  /** Relative time ("2h ago"). */
  time?: string;
  /** Markdown body (bold, italic, code, links, - lists, @mentions). */
  body: string;
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

/** Story/task comment thread with markdown + @mentions. */
export function CommentThread(props: CommentThreadProps): React.JSX.Element;

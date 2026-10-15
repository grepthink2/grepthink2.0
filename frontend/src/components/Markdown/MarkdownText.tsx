import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MarkdownText.scss';

interface Props {
  children: string;
  className?: string;
  /** 'compact' (default) is the dense look of scrum cards and comments; 'document' is a full page body (the project description). */
  variant?: 'compact' | 'document';
}

const COMPONENTS: Components = {
  // react-markdown empties an unsafe URL (javascript: and the like): keep the text, drop the link.
  a: ({ href, children }) =>
    href ? (
      <a className="gt-md__link" href={href} target="_blank" rel="noreferrer">{children}</a>
    ) : (
      <>{children}</>
    ),
  // Never load media: an image becomes a link to it, or just its alt text when its URL was unsafe.
  img: ({ src, alt }) =>
    typeof src === 'string' && src ? (
      <a className="gt-md__link" href={src} target="_blank" rel="noreferrer">{alt || src}</a>
    ) : (
      <>{alt}</>
    ),
  code: ({ children }) => <code className="gt-md__code">{children}</code>,
  // GFM task-list items show their state; a click must not change it.
  input: ({ checked }) => (
    <input type="checkbox" className="gt-md__checkbox" checked={Boolean(checked)} disabled readOnly />
  ),
};

/**
 * Shared markdown renderer for user-authored bodies (story/task descriptions,
 * comments). Styling comes from the `.gt-md` layer in MarkdownText.scss.
 *
 * Mentions (issue #191) add one more `components` override here — an `a` whose
 * href starts with `mention:` renders as a chip instead of a link — so every
 * surface picks up mentions at once. No media ever loads (an image renders as a
 * link to it), and raw HTML is safe because, with `skipHtml` off and no
 * rehype-raw, react-markdown shows it as the literal characters typed.
 */
export default function MarkdownText({ children, className = '', variant = 'compact' }: Props) {
  const root = variant === 'document' ? 'gt-md gt-md--document' : 'gt-md';
  return (
    <div className={`${root} ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

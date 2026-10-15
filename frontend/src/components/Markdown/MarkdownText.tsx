import { createContext, useContext } from 'react';
import type { ComponentProps } from 'react';
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

// True inside a rendered link (the `a` override provides it), where an image must not add a second <a>.
const InsideLinkContext = createContext(false);

// Never load media: an image becomes a link to it, or just its alt text when its URL was unsafe.
// Inside a link it is text (its alt, else its URL), so that link stays one anchor.
function MarkdownImage({ src, alt }: ComponentProps<'img'>) {
  const insideLink = useContext(InsideLinkContext);
  const url = typeof src === 'string' ? src : '';
  if (insideLink) return <>{alt || url}</>;
  return url ? (
    <a className="gt-md__link" href={url} target="_blank" rel="noreferrer">{alt || url}</a>
  ) : (
    <>{alt}</>
  );
}

const COMPONENTS: Components = {
  // react-markdown empties an unsafe URL (javascript: and the like): keep the text, drop the link.
  // The other props pass through, so footnote links keep their id and data/aria attributes. An
  // in-page link (a footnote's #…) stays in the tab, and so does a mail link (GFM links a bare
  // email as mailto:), which a new tab would leave blank.
  a: ({ node, href, className, children, ...rest }) => {
    if (!href) return <>{children}</>;
    const linkClass = className ? `gt-md__link ${className}` : 'gt-md__link';
    const content = <InsideLinkContext.Provider value={true}>{children}</InsideLinkContext.Provider>;
    if (href.startsWith('#') || href.startsWith('mailto:')) {
      return <a {...rest} className={linkClass} href={href}>{content}</a>;
    }
    return <a {...rest} className={linkClass} href={href} target="_blank" rel="noreferrer">{content}</a>;
  },
  img: MarkdownImage,
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

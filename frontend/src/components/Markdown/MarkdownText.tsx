import ReactMarkdown from 'react-markdown';

interface Props {
  children: string;
  className?: string;
}

/**
 * Shared markdown renderer for user-authored bodies (story/task descriptions,
 * comments). Styling comes from the `.gt-md` layer.
 *
 * The mentions plan adds one more `components` override here — an `a` whose
 * href starts with `mention:` renders as a chip instead of a link — so every
 * surface picks up mentions at once. Raw HTML stays disabled (react-markdown's
 * default), which is what keeps user input safe to render.
 */
export default function MarkdownText({ children, className = '' }: Props) {
  return (
    <div className={`gt-md ${className}`.trim()}>
      <ReactMarkdown
        components={{
          a: ({ href, children: kids }) => (
            <a className="gt-md__link" href={href} target="_blank" rel="noreferrer">{kids}</a>
          ),
          code: ({ children: kids }) => <code className="gt-md__code">{kids}</code>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

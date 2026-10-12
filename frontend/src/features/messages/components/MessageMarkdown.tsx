import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { MESSAGE_REMARK_PLUGINS } from '../messageMarkdown';

const COMPONENTS: Components = {
  // An unsafe URL (javascript: and the like) arrives as an empty href: keep the text, drop the link.
  a: ({ href, children }) =>
    href ? (
      <a className="messages-md__link" href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <>{children}</>
    ),
  code: ({ children }) => <code className="messages-md__code">{children}</code>,
  pre: ({ children }) => <pre className="messages-md__pre">{children}</pre>,
};

interface Props {
  body: string;
  className?: string;
}

/**
 * A message body with its formatting (the subset in `messageMarkdown.ts`). Raw HTML
 * never renders: the parser does not read it, and react-markdown would not either.
 */
export function MessageMarkdown({ body, className = '' }: Props) {
  return (
    <div className={`messages-md ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={MESSAGE_REMARK_PLUGINS} components={COMPONENTS}>
        {body}
      </ReactMarkdown>
    </div>
  );
}

const noElements = () => false;

/** A message body as plain text for one-line previews: the words stay, the marks go. */
export const MessagePlainText = React.memo(function MessagePlainText({ body }: { body: string }) {
  return (
    <ReactMarkdown remarkPlugins={MESSAGE_REMARK_PLUGINS} allowElement={noElements} unwrapDisallowed>
      {body}
    </ReactMarkdown>
  );
});

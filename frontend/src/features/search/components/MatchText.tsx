import { Fragment, type ReactNode } from 'react';

interface MatchTextProps {
  text: string;
  query: string;
}

/** `text` with every case-insensitive occurrence of `query` wrapped in <mark>. */
export function MatchText({ text, query }: MatchTextProps) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(q);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark>{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
    at = lower.indexOf(q, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>{part}</Fragment>
      ))}
    </>
  );
}

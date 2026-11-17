import { Fragment, type ReactNode } from 'react';
import type { BodyChange, WordPart } from '../utils/diff';

interface ChangeListProps {
  changes: BodyChange[];
  /** A story's name for a change to a list of board stories: "US-3 Trail search". */
  storyName: (id: string) => string;
}

/** Inserted words, marked for the eye (underlined) and for a screen reader, which ignores `<ins>`. */
function Inserted({ children }: { children: ReactNode }) {
  return <ins className="document-change__ins"><span className="gt-visually-hidden">added: </span>{children}</ins>;
}

/** Deleted words, struck through and named for a screen reader. */
function Deleted({ children }: { children: ReactNode }) {
  return <del className="document-change__del"><span className="gt-visually-hidden">removed: </span>{children}</del>;
}

function Words({ parts }: { parts: WordPart[] }) {
  return (
    <span className="document-change__words">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          {part.op === 'ins' ? <Inserted>{part.text}</Inserted> : part.op === 'del' ? <Deleted>{part.text}</Deleted> : part.text}
        </Fragment>
      ))}
    </span>
  );
}

/** The item a change is about, as the reader knows it. */
function itemOf(change: BodyChange, storyName: (id: string) => string): string {
  if ('story' in change && change.story && change.itemId) return storyName(change.itemId);
  const label = change.label?.trim();
  return label ? `“${label}”` : 'an untitled item';
}

function Line({ change, storyName }: { change: BodyChange; storyName: (id: string) => string }) {
  const where = <span className="document-change__where">{change.section}</span>;
  switch (change.type) {
    case 'added':
      return <>{where}: <Inserted>{itemOf(change, storyName)}</Inserted></>;
    case 'removed':
      return <>{where}: <Deleted>{itemOf(change, storyName)}</Deleted></>;
    case 'moved':
      return <>{where}: {itemOf(change, storyName)} moved from {change.from} to {change.to}</>;
    default: {
      const item = change.itemId ? <>, {itemOf(change, storyName)}</> : null;
      const field = <span className="document-change__field">{change.field}</span>;
      const detail = change.change;
      if (detail.kind === 'text') return <>{where}{item}, {field}: <Words parts={detail.parts} /></>;
      if (detail.kind === 'value') return <>{where}{item}, {field}: <Deleted>{detail.from}</Deleted> to <Inserted>{detail.to}</Inserted></>;
      return (
        <>
          {where}{item}, {field}:
          {detail.added.map((id) => <Fragment key={`+${id}`}> <Inserted>{storyName(id)}</Inserted></Fragment>)}
          {detail.removed.map((id) => <Fragment key={`-${id}`}> <Deleted>{storyName(id)}</Deleted></Fragment>)}
        </>
      );
    }
  }
}

/**
 * Two revisions' differences, one line per change: an item added or removed, an item moved from one
 * place to another, a field changed word by word (`<ins>` and `<del>`, also named for a screen
 * reader), a value changed from one to another, a scenario's stories gained and lost.
 */
export default function ChangeList({ changes, storyName }: ChangeListProps) {
  if (changes.length === 0) return <p className="document-changes__none">Nothing changed between these revisions.</p>;
  return (
    <ul className="document-changes">
      {changes.map((change, i) => (
        <li key={i} className={`document-change document-change--${change.type}`}>
          <span className="document-change__type">
            {change.type === 'added' ? 'Added' : change.type === 'removed' ? 'Removed' : change.type === 'moved' ? 'Moved' : 'Changed'}
          </span>
          <span className="document-change__text"><Line change={change} storyName={storyName} /></span>
        </li>
      ))}
    </ul>
  );
}

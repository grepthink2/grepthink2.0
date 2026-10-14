import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import type { ApiSearchItemType } from '@/lib/api/types';
import { shortDate } from '../format';
import type { SearchItem } from '../searchModel';
import { EntityIcon } from './EntityIcon';
import { Kbd } from './Kbd';
import { MatchText } from './MatchText';

const TYPE_LABEL: Record<ApiSearchItemType, string> = {
  person: 'Person',
  project: 'Project',
  task: 'Task',
  story: 'Story',
  conversation: 'Chat',
  class: 'Class',
  assignment: 'Assignment',
};

const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' } as const;

/** The context line: status (tasks), the server's subtitle, tags (tasks), last message date (chats). */
function Context({ item }: { item: SearchItem }) {
  const bits: ReactNode[] = [];
  if (item.type === 'task' && item.status) {
    bits.push(
      <span key="status" className="gt-result__status">
        <span className={`gt-result__status-dot gt-result__status-dot--${item.status}`} />
        {STATUS_LABEL[item.status]}
      </span>,
    );
  }
  if (item.subtitle) bits.push(<span key="subtitle">{item.subtitle}</span>);
  if (item.type === 'task') {
    (item.tags ?? []).slice(0, 2).forEach((tag) => {
      bits.push(<span key={`tag-${tag}`} className="gt-palette__tag">{tag}</span>);
    });
  }
  if (item.type === 'conversation') {
    const when = shortDate(item.last_message_at);
    if (when) bits.push(<span key="date">{when}</span>);
  }
  if (bits.length === 0) return null;
  return (
    <span className="gt-result__context">
      {bits.map((bit, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="gt-result__dot" aria-hidden="true" />}
          {bit}
        </Fragment>
      ))}
    </span>
  );
}

interface ResultRowProps {
  item: SearchItem;
  query: string;
  active: boolean;
  /** The `aria-activedescendant` target id. */
  id: string;
  onSelect: (item: SearchItem) => void;
  onHover: () => void;
}

/** One palette row. Mouse movement sets the active row (one highlight for mouse and keyboard). */
export function ResultRow({ item, query, active, id, onSelect, onHover }: ResultRowProps) {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);
  return (
    <li
      ref={ref}
      id={id}
      role="option"
      aria-selected={active}
      className="gt-result"
      onMouseMove={onHover}
      onClick={() => onSelect(item)}
    >
      <EntityIcon type={item.type} name={item.title} />
      <span className="gt-result__main">
        <span className="gt-result__title">
          {item.key && <span className="gt-result__key">{item.key}</span>}
          <MatchText text={item.title} query={query} />
        </span>
        <Context item={item} />
      </span>
      <span className="gt-result__meta">
        {item.type === 'conversation' && (item.unread ?? 0) > 0 && (
          <span className="gt-result__badge" aria-label={`${item.unread} unread`}>{item.unread}</span>
        )}
        <span className="gt-result__type">{TYPE_LABEL[item.type]}</span>
        <span className="gt-result__enter" aria-hidden="true"><Kbd>↵</Kbd></span>
      </span>
    </li>
  );
}

interface ResultGroupProps {
  label: string;
  count?: number;
  /** "See all n" narrows the scope to this group. */
  onSeeAll?: () => void;
}

/** Uppercase group label at a type boundary. */
export function ResultGroup({ label, count, onSeeAll }: ResultGroupProps) {
  return (
    <li className="gt-result-group" role="presentation">
      {label}
      {count !== undefined && <span className="gt-result-group__count">{count}</span>}
      {onSeeAll && (count ?? 0) > 1 && (
        <button type="button" className="gt-result-group__action" onClick={onSeeAll} tabIndex={-1}>
          See all {count}
        </button>
      )}
    </li>
  );
}

import React from 'react';
import { EntityIcon } from './EntityIcon.jsx';
import { MatchText } from './MatchText.jsx';
import { Kbd } from './Kbd.jsx';

const TYPE_LABEL = { person: 'Person', team: 'Team', project: 'Project', task: 'Task', story: 'Story', conversation: 'Chat', class: 'Class', assignment: 'Assignment', action: 'Action' };
const STATUS_LABEL = { todo: 'To do', in_progress: 'In progress', done: 'Done' };

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function tagClass(t) { return `gt-tagbadge gt-tagbadge--${String(t).toLowerCase().replace(/[^a-z]/g, '')}`; }

/** Entity-specific context line. Each piece is a <span>; dots separate them. */
function Context({ item }) {
  const bits = [];
  const push = (node, k) => { if (node) bits.push(<span key={k}>{node}</span>); };
  switch (item.type) {
    case 'task':
      push(item.status && <span className="gt-result__status"><span className={`gt-result__status-dot gt-result__status-dot--${item.status}`} />{STATUS_LABEL[item.status]}</span>, 's');
      push(item.dueAt && `Due ${fmtDate(item.dueAt)}`, 'd');
      push(Number.isFinite(item.points) && `${item.points} pts`, 'p');
      push(Number.isFinite(item.estimateHours) && `${item.estimateHours}h`, 'e');
      (item.tags || []).slice(0, 2).forEach((t, i) => push(<span className={tagClass(t)}>{t}</span>, `t${i}`));
      break;
    case 'story':
      push(item.sprint, 'sp');
      push(Number.isFinite(item.points) && `${item.points} pts`, 'p');
      push(Number.isFinite(item.tasksTotal) && `${item.tasksDone ?? 0}/${item.tasksTotal} tasks done`, 't');
      break;
    case 'conversation':
      push(item.subtitle || 'Direct message', 's');
      push(item.lastMessageAt && fmtDate(item.lastMessageAt), 'd');
      break;
    default:
      push(item.subtitle, 's');
      push(Number.isFinite(item.memberCount) && `${item.memberCount} members`, 'm');
      push(item.term, 'tm');
  }
  if (!bits.length) return null;
  return (
    <span className="gt-result__context">
      {bits.map((b, i) => <React.Fragment key={i}>{i > 0 && <span className="gt-result__dot" aria-hidden="true" />}{b}</React.Fragment>)}
    </span>
  );
}

/**
 * One palette row. Mouse-hover sets the active index (one highlight for mouse
 * and keyboard); click selects. `role="option"` + `aria-selected`.
 */
export function ResultRow({ item, query = '', active = false, id, onSelect, onHover, className = '' }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (active && ref.current) {
      const el = ref.current, parent = el.closest('.gt-palette__body');
      if (parent) {
        const top = el.offsetTop - parent.offsetTop, bottom = top + el.offsetHeight;
        if (top < parent.scrollTop) parent.scrollTop = top - 4;
        else if (bottom > parent.scrollTop + parent.clientHeight) parent.scrollTop = bottom - parent.clientHeight + 4;
      }
    }
  }, [active]);
  return (
    <li
      ref={ref}
      id={id}
      role="option"
      aria-selected={active}
      className={['gt-result', className].filter(Boolean).join(' ')}
      onMouseMove={onHover}
      onClick={() => onSelect && onSelect(item)}
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
        {item.type === 'conversation' && item.unread > 0 && <span className="gt-result__badge" aria-label={`${item.unread} unread`}>{item.unread}</span>}
        <span className="gt-result__type">{TYPE_LABEL[item.type] || item.type}</span>
        <span className="gt-result__enter" aria-hidden="true"><Kbd>↵</Kbd></span>
      </span>
    </li>
  );
}

/** Uppercase group label with count; optional "See all" that narrows the scope. */
export function ResultGroup({ label, count, onSeeAll }) {
  return (
    <li className="gt-result-group" role="presentation" aria-hidden="true">
      {label}{Number.isFinite(count) && <span className="gt-result-group__count">{count}</span>}
      {onSeeAll && count > 0 && <button type="button" className="gt-result-group__action" onClick={onSeeAll} tabIndex={-1}>See all {count}</button>}
    </li>
  );
}

import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import { Popover } from '@components/Popover/Popover';
import { PersonHoverCard, type PersonCardLines, type PersonRef } from './PersonHoverCard';
import './PersonLink.scss';

/** How long a mouse pointer rests on the name before the card opens: the members panel's timing. */
export const HOVER_OPEN_MS = 150;
/** How long the pointer may stray, across the gap into the card, before it closes. */
export const HOVER_CLOSE_MS = 300;

export interface PersonLinkProps extends Omit<LinkProps, 'to' | 'children'> {
  person: PersonRef;
  /** @default `/app/people/${person.id}` */
  to?: LinkProps['to'];
  /** Lines from data the row already holds. With it, a resting mouse pointer opens PersonHoverCard. */
  card?: PersonCardLines;
  /**
   * `plain` (a cell, a row, a heading) underlines on hover and focus; `inline` (inside a sentence)
   * keeps a quiet underline at rest, so the link is not told apart by colour alone.
   * @default 'plain'
   */
  variant?: 'plain' | 'inline';
  /** Defaults to the person's name. */
  children?: ReactNode;
}

/**
 * A person's name as the link to their page, `/app/people/:userId`, in the colour of the text
 * around it.
 *
 * With `card`, a mouse pointer that rests on the name opens PersonHoverCard, and may cross into it;
 * Esc, following the link or leaving closes it. Never on touch and never on keyboard focus: there
 * the link goes straight to the page, which shows the same and more.
 */
export function PersonLink({ person, to, card, variant = 'plain', children, className = '', onClick, ...rest }: PersonLinkProps) {
  const [open, setOpen] = useState(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const clearTimers = useCallback(() => {
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
  }, []);
  useEffect(() => clearTimers, [clearTimers]);
  const close = useCallback(() => {
    clearTimers();
    setOpen(false);
  }, [clearTimers]);

  const target = to ?? `/app/people/${person.id}`;
  const link = (
    <Link
      {...rest}
      to={target}
      className={['gt-person-link', `gt-person-link--${variant}`, className].filter(Boolean).join(' ')}
      onClick={(event) => {
        close();
        onClick?.(event);
      }}
    >
      {children ?? person.name}
    </Link>
  );
  if (!card) return link;

  const enter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    clearTimers();
    if (!open) openTimer.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_MS);
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    clearTimers();
    closeTimer.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };
  return (
    <span className="gt-person-link-wrap" onPointerEnter={enter} onPointerLeave={leave}>
      <Popover open={open} onClose={close} size="sm" className="gt-person-link__popover" anchor={link}>
        <PersonHoverCard person={person} roleLine={card.roleLine} teamLine={card.teamLine} to={target} />
      </Popover>
    </span>
  );
}

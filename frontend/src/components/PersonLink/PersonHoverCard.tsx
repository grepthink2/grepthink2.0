import { Link, type LinkProps } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Avatar } from '@components/Avatar/Avatar';
import './PersonLink.scss';

/** Who a link or a card is about. `name` is what is shown; a list passes the name it already shows. */
export interface PersonRef {
  id: string;
  name: string;
  image_url?: string | null;
}

/** The card's two lines, from data the row it opens from already holds. */
export interface PersonCardLines {
  /** "Student · CSE 115A": their role in the class the viewer shares with them. */
  roleLine?: string | null;
  /** "Trailhead · Product Owner": their team there, when they have one. */
  teamLine?: string | null;
}

export interface PersonHoverCardProps extends PersonCardLines {
  person: PersonRef;
  /** @default `/app/people/${person.id}` */
  to?: LinkProps['to'];
  className?: string;
}

/**
 * A small card about a person: a 48px Avatar, the name, one line for their role in the class the
 * viewer shares with them, one for their team, and "View profile". It shows only what the row it
 * opens from already showed. The content of PersonLink's hover card; usable on its own.
 */
export function PersonHoverCard({ person, roleLine, teamLine, to, className = '' }: PersonHoverCardProps) {
  return (
    <div className={['gt-person-card', className].filter(Boolean).join(' ')}>
      <div className="gt-person-card__top">
        <Avatar name={person.name} src={person.image_url || undefined} size="lg" decorative />
        <div className="gt-person-card__text">
          <p className="gt-person-card__name">{person.name}</p>
          {roleLine && <p className="gt-person-card__line">{roleLine}</p>}
          {teamLine && <p className="gt-person-card__line">{teamLine}</p>}
        </div>
      </div>
      <Link className="gt-person-card__view" to={to ?? `/app/people/${person.id}`}>
        View profile
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

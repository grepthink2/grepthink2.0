import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './Card.scss';

/** A visible title, which an interactive card needs: its text names the link or button. */
type CardTitle = Exclude<ReactNode, null | undefined | boolean>;

interface CardBaseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onClick'> {
  children?: ReactNode;
  footer?: ReactNode;
  subtitle?: ReactNode;
  /** Right side of the header (IconButtons, a Menu trigger, a small Button), above the stretched title. */
  actions?: ReactNode;
  /** The title's element. @default 'h3' */
  titleAs?: 'h2' | 'h3' | 'h4' | 'p';
  /** @default 'card' */
  shadow?: 'card' | 'hairline' | 'none';
  /** 1px border, no shadow, radius 7, 12×14 padding: cards inside a card or a list. @default false */
  bordered?: boolean;
  /** The selected border (2px inset green); on a button card also `aria-pressed`. */
  selected?: boolean;
  /** @default true */
  padded?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/** A plain surface, with any header. */
export interface CardStaticProps extends CardBaseProps {
  /** Replaces the default title and subtitle block. */
  header?: ReactNode;
  /** The visible heading. Never the HTML `title` attribute: the card does not forward it. */
  title?: ReactNode;
  href?: undefined;
  to?: undefined;
  onClick?: undefined;
}

/** A card that is a link, stretched over the card from its title: to another site (an in-app route is `to`). */
export interface CardLinkProps extends CardBaseProps {
  href: string;
  /** The visible heading, and the link's text. */
  title: CardTitle;
  /** The title is the link, so there is no custom header. */
  header?: never;
  to?: never;
  onClick?: never;
}

/** A card that is a react-router link to an in-app route, stretched over the card from its title. */
export interface CardRouteProps extends CardBaseProps {
  to: LinkProps['to'];
  /** The visible heading, and the link's text. */
  title: CardTitle;
  /** The title is the link, so there is no custom header. */
  header?: never;
  href?: never;
  onClick?: never;
}

/** A card that is a button, stretched over the card from its title. */
export interface CardButtonProps extends CardBaseProps {
  onClick: () => void;
  /** The visible heading, and the button's text. */
  title: CardTitle;
  /** The title is the button, so there is no custom header. */
  header?: never;
  href?: never;
  to?: never;
}

export type CardProps = CardStaticProps | CardLinkProps | CardRouteProps | CardButtonProps;

const shows = (node: ReactNode) => node !== undefined && node !== null && node !== false && node !== '';

/**
 * The standard white surface, ported from design/components/display/Card.jsx. `shadow` is card (the
 * 2.61px signature), hairline (1px border and a whisper) or none; `bordered` is the 1px, radius-7 card
 * for anything nested in a card or a list. A header holds the title (an h3 unless `titleAs` says) and
 * subtitle, or a custom `header`, with `actions` on its right; the body is padded unless `padded` is
 * false; `footer` sits under a hairline.
 *
 * With `href`, `to` or `onClick` the card is interactive: its title becomes the real link or button,
 * stretched over the whole card, so the card is one target with one name, while `actions` and the
 * footer stay their own targets above the stretch. Hover deepens the shadow, keyboard focus rings the
 * card, and `selected` draws the green border (with `aria-pressed` on a button card). The types ask
 * an interactive card for a title and one target; a card without a title stays a plain surface.
 *
 * Native props and `ref` reach the card's root. Codebase-side: `to` renders a react-router `Link`, so
 * an in-app card opens without reloading the app (`href` is for another site), as Button's `to` does;
 * the button calls `onClick` with no arguments; and the focus ring is the card's alone (index.css
 * would ring the title too).
 */
export function Card({
  children, header, footer, title, subtitle, actions, titleAs: Title = 'h3', shadow = 'card', bordered = false,
  href, to, onClick, selected, padded = true, className = '', ref, ...rest
}: CardProps) {
  const interactive = Boolean(href || to !== undefined || onClick) && shows(title);
  let titleContent: ReactNode = title;
  if (interactive && to !== undefined) {
    titleContent = <Link className="gt-card__link" to={to}>{title}</Link>;
  } else if (interactive && href) {
    titleContent = <a className="gt-card__link" href={href}>{title}</a>;
  } else if (interactive) {
    titleContent = (
      <button type="button" className="gt-card__link" onClick={() => onClick?.()} aria-pressed={selected}>
        {title}
      </button>
    );
  }
  return (
    <div
      {...rest}
      ref={ref}
      className={[
        'gt-card',
        bordered ? 'gt-card--bordered' : `gt-card--${shadow}`,
        interactive ? 'gt-card--interactive' : '',
        selected ? 'gt-card--selected' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {(shows(header) || shows(title) || shows(actions)) && (
        <div className="gt-card__header">
          {shows(header) ? header : (
            <div className="gt-card__heading">
              {shows(title) && <Title className="gt-card__title">{titleContent}</Title>}
              {shows(subtitle) && <p className="gt-card__subtitle">{subtitle}</p>}
            </div>
          )}
          {shows(actions) && <div className="gt-card__actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'gt-card__body' : 'gt-card__body gt-card__body--flush'}>{children}</div>
      {shows(footer) && <div className="gt-card__footer">{footer}</div>}
    </div>
  );
}

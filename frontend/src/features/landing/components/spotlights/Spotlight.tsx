import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useInView } from '../../hooks/useInView';
import type { BandBadge } from '../../landing.config';
import './Spotlight.scss';

export interface SpotlightPoint {
  icon: LucideIcon;
  text: string;
}

interface SpotlightProps {
  id: string;
  /** Eyebrow text after the badge, e.g. "Scrum board". */
  label: string;
  badge: BandBadge;
  /** Heading up to the accented phrase. */
  title: string;
  /** Accented end of the heading. */
  accent: string;
  lead: string;
  points: SpotlightPoint[];
  /** Side the text sits on at desktop widths; the stage takes the other. */
  textSide: 'left' | 'right';
  tone?: 'plain' | 'tinted';
  /** `preview` marks a feature that hasn't shipped. */
  stage?: 'live' | 'preview';
  aside?: { title: string; text: string };
  cta?: { label: string; to: string };
  /** The stage's floating cards. */
  children: React.ReactNode;
}

const BADGE_TEXT = { new: 'New', soon: 'Soon' } as const;

/** One feature band: copy on one side, a decorative stage of floating cards on the other. */
const Spotlight: React.FC<SpotlightProps> = ({
  id,
  label,
  badge,
  title,
  accent,
  lead,
  points,
  textSide,
  tone = 'plain',
  stage = 'live',
  aside,
  cta,
  children,
}) => {
  const [ref, { seen, visible }] = useInView<HTMLElement>();
  const headingId = `${id}-title`;
  const className = [
    'spotlight',
    `spotlight--text-${textSide}`,
    `spotlight--${tone}`,
    seen ? 'is-seen' : '',
    visible ? '' : 'is-offscreen',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section id={id} ref={ref} className={className} aria-labelledby={headingId}>
      <div className="spotlight__inner">
        <div className="spotlight__text">
          <p className={`spotlight__eyebrow${badge === 'soon' ? ' spotlight__eyebrow--soon' : ''}`}>
            {badge && <span className="spotlight__badge">{BADGE_TEXT[badge]}</span>}
            {label}
          </p>
          <h2 id={headingId} className="spotlight__title">
            {title} <span className="spotlight__accent">{accent}</span>
          </h2>
          <p className="spotlight__lead">{lead}</p>
          <ul className="spotlight__points">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="spotlight__point">
                <span className="spotlight__point-icon" aria-hidden="true">
                  <Icon size={17} strokeWidth={2} />
                </span>
                {text}
              </li>
            ))}
          </ul>
          {aside && (
            <div className="spotlight__aside">
              <strong className="spotlight__aside-title">{aside.title}</strong>
              <p className="spotlight__aside-text">{aside.text}</p>
            </div>
          )}
          {cta && (
            <Link to={cta.to} className="spotlight__cta">
              {cta.label} <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
        <div className={`spotlight__stage spotlight__stage--${stage}`} aria-hidden="true">
          {children}
        </div>
      </div>
    </section>
  );
};

export default Spotlight;

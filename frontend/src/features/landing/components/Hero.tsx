import React from 'react';
import { Link } from 'react-router-dom';
import FloatingCards from './FloatingCards';
import { ANNOUNCEMENT, sectionLink, type Announcement } from '../landing.config';
import './Hero.scss';

interface HeroProps {
  /** Launch announcement shown in place of the eyebrow; null restores the eyebrow. */
  announcement?: Announcement | null;
}

const Hero: React.FC<HeroProps> = ({ announcement = ANNOUNCEMENT }) => {
  return (
    <section className="hero">
      <FloatingCards />

      <div className="hero__content">
        {announcement ? (
          <Link
            to={sectionLink(announcement.targetId)}
            className="hero__announce"
            aria-label={`New: ${announcement.label}. Jump to the section`}
          >
            <span className="hero__announce-badge">New</span>
            {announcement.label}
            <span className="hero__announce-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ) : (
          <span className="hero__eyebrow">For instructors and student teams</span>
        )}

        <h1 className="hero__title">
          Build better project teams,
          <br />
          <span className="hero__title-accent">all in one place</span>
        </h1>

        <p className="hero__subtitle">
          {announcement
            ? 'grepthink helps instructors and student teams form balanced teams, track weekly progress, and keep everyone accountable without the spreadsheet chaos.'
            : 'grepthink helps classes form balanced teams, track weekly progress, and keep everyone accountable without the spreadsheet chaos.'}
        </p>

        <div className="hero__actions">
          <Link to="/select" className="hero__cta">
            Get started
          </Link>
          <Link to="/login" className="hero__signin">
            Sign in <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;

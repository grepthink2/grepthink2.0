import React from 'react';
import { Link } from 'react-router-dom';
import FloatingCards from './FloatingCards';
import './Hero.scss';

const Hero: React.FC = () => {
  return (
    <section className="hero">
      <FloatingCards />

      <div className="hero__content">
        <span className="hero__eyebrow">For instructors and student teams</span>

        <h1 className="hero__title">
          Build better project teams,
          <br />
          <span className="hero__title-accent">all in one place</span>
        </h1>

        <p className="hero__subtitle">
          grepthink helps classes form balanced teams, track weekly progress, and
          keep everyone accountable without the spreadsheet chaos.
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

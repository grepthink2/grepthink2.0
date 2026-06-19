import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '@assets/grepthink l logo.svg?url';
import './Header.scss';

/**
 * Public landing header.
 *
 * Starts as a full-width dark bar pinned to the top of the page and, once the
 * user scrolls past `SCROLL_THRESHOLD`, collapses into a centered floating
 * pill. The morph is pure CSS (driven by the `--scrolled` modifier); this
 * component only owns the scroll-state boolean.
 */
const SCROLL_THRESHOLD = 64;

const Header: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      // Coalesce scroll events into a single rAF read to avoid layout thrash.
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > SCROLL_THRESHOLD);
        frame = 0;
      });
    };

    onScroll(); // sync initial state (e.g. on reload mid-page)
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className={`landing-header ${scrolled ? 'landing-header--scrolled' : ''}`}>
      <div className="landing-header__inner">
        <Link to="/" className="landing-header__logo" aria-label="grepthink home">
          <img src={logo} alt="grepthink" />
        </Link>

        <nav className="landing-header__nav" aria-label="Primary">
          <Link to="/contact" className="landing-header__link">
            Contact
          </Link>
          <Link to="/login" className="landing-header__btn landing-header__btn--ghost">
            Sign in
          </Link>
          <Link to="/select" className="landing-header__btn landing-header__btn--primary">
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
};

export default Header;

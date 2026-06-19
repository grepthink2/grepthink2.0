import React from 'react';
import { Link } from 'react-router-dom';
import logo from '@assets/grepthink l logo.svg?url';
import './Footer.scss';

const Footer: React.FC = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="landing-footer">
      <div className="landing-footer__inner">
        <div className="landing-footer__brand">
          <img src={logo} alt="grepthink" className="landing-footer__logo" />
          <p className="landing-footer__tagline">Think in teams.</p>
        </div>

        <nav className="landing-footer__links" aria-label="Footer">
          <div className="landing-footer__col">
            <span className="landing-footer__col-title">Product</span>
            <Link to="/select">Get started</Link>
            <a href="#solutions">Solutions</a>
          </div>
          <div className="landing-footer__col">
            <span className="landing-footer__col-title">Account</span>
            <Link to="/login">Sign in</Link>
            <Link to="/select">Create account</Link>
          </div>
          <div className="landing-footer__col">
            <span className="landing-footer__col-title">Company</span>
            <Link to="/contact">Contact</Link>
          </div>
        </nav>
      </div>

      <div className="landing-footer__bar">
        <span>© {year} grepthink</span>
      </div>
    </footer>
  );
};

export default Footer;

import React from 'react';
import { Link } from 'react-router-dom';
import './ClosingBand.scss';

/** Last call to action before the footer. */
const ClosingBand: React.FC = () => (
  <section className="closing-band" aria-labelledby="closing-band-title">
    <div className="closing-band__inner">
      <h2 id="closing-band-title" className="closing-band__title">
        Ready to run your class on grepthink?
      </h2>
      <p className="closing-band__text">
        Create a class and import your roster. Every team gets a scrum board and its own channels
        from day one.
      </p>
      <div className="closing-band__actions">
        <Link to="/select" className="closing-band__primary">
          Get started
        </Link>
        <Link to="/contact" className="closing-band__secondary">
          Talk to us
        </Link>
      </div>
    </div>
  </section>
);

export default ClosingBand;

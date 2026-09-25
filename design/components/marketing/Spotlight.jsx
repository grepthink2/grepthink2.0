import React from 'react';
import { Eyebrow } from './Eyebrow.jsx';

/**
 * Spotlight band: one full-width feature section. Text (eyebrow with
 * badge, heading with gradient accent, lead, bullets, optional staff note
 * and link) on one side, a decorative Stage on the other. `side` says
 * where the stage sits; bands alternate. `reveal` drives the once-per-view
 * entrance ('idle' → 'seen' → 'settled'); omit it for static rendering.
 */
export function Spotlight({
  id,
  eyebrow,
  badge,
  tone = 'green',
  heading,
  headingAccent,
  lead,
  bullets = [],
  note,
  link,
  side = 'right',
  alt = false,
  hairline = false,
  reveal,
  children,
  className = '',
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-reveal={reveal || undefined}
      className={['gt-spotlight', alt ? 'gt-spotlight--alt' : '', hairline ? 'gt-spotlight--hairline' : '', side === 'left' ? 'gt-spotlight--stage-left' : '', className].filter(Boolean).join(' ')}
    >
      <div className="gt-spotlight__inner">
        <div className="gt-spotlight__text">
          {eyebrow && <Eyebrow badge={badge} tone={tone}>{eyebrow}</Eyebrow>}
          <h2 className="gt-spotlight__heading" id={headingId}>
            {heading}{headingAccent && <React.Fragment> <span className="gt-mkt-accent">{headingAccent}</span></React.Fragment>}
          </h2>
          {lead && <p className="gt-spotlight__lead">{lead}</p>}
          {bullets.length > 0 && (
            <ul className="gt-spotlight__bullets">
              {bullets.map((b, i) => (
                <li key={i} className="gt-spotlight__bullet">
                  {b.icon && <span className="gt-spotlight__bullet-icon" aria-hidden="true">{b.icon}</span>}
                  <span>{b.text ?? b}</span>
                </li>
              ))}
            </ul>
          )}
          {note && (
            <div className="gt-spotlight__note">
              {note.title && <strong className="gt-spotlight__note-title">{note.title}</strong>}
              <p>{note.text}</p>
            </div>
          )}
          {link && <a className="gt-spotlight__link" href={link.href}>{link.label} <span aria-hidden="true">→</span></a>}
        </div>
        {children}
      </div>
    </section>
  );
}

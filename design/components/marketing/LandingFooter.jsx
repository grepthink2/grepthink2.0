import React from 'react';

const DEFAULT_COLUMNS = [
  { title: 'Product', links: [
    { label: 'Get started', href: '/select' },
    { label: 'Solutions', href: '#solutions' },
    { label: 'Scrum board', href: '#scrum-board' },
    { label: 'Messaging', href: '#messaging' },
    { label: 'Project assistant', href: '#project-assistant' },
  ] },
  { title: 'Account', links: [{ label: 'Sign in', href: '/login' }, { label: 'Create account', href: '/select' }] },
  { title: 'Company', links: [{ label: 'Contact', href: '/contact' }] },
];

/** Dark landing footer: logo + tagline, link columns, legal bar. */
export function LandingFooter({ logoSrc, tagline = 'Think in teams.', columns = DEFAULT_COLUMNS, year = new Date().getFullYear(), compact = false, className = '' }) {
  return (
    <footer className={['gt-landing-footer', compact ? 'gt-landing-footer--compact' : '', className].filter(Boolean).join(' ')}>
      <div className="gt-landing-footer__inner">
        <div className="gt-landing-footer__brand">
          {logoSrc ? <img src={logoSrc} alt="grepthink" className="gt-landing-footer__logo" /> : <span style={{ color: '#fff', fontWeight: 700, fontSize: 22, marginBottom: 16 }}>grepthink</span>}
          <p className="gt-landing-footer__tagline">{tagline}</p>
        </div>
        <nav className="gt-landing-footer__links" aria-label="Footer">
          {columns.map((col) => (
            <div key={col.title} className="gt-landing-footer__col">
              <span className="gt-landing-footer__col-title">{col.title}</span>
              {col.links.map((l) => <a key={l.href + l.label} href={l.href}>{l.label}</a>)}
            </div>
          ))}
        </nav>
      </div>
      <div className="gt-landing-footer__bar"><span>© {year} grepthink</span></div>
    </footer>
  );
}

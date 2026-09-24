import React from 'react';

/**
 * Static, decorative product mocks that float around the hero — grepthink's
 * real artifacts (a project team, milestones, a weekly TSR, a roster) standing
 * in for the generic sticky-notes of the reference. Purely visual: no data, no
 * behavior, hidden from assistive tech.
 *
 * The per-card/per-team avatar colors below predate the --gt-* design-token
 * system and are a marketing-only decorative set (needs more distinct hues
 * than the token set provides) — left as-is rather than churned as a side
 * effect of wiring the adherence lint.
 */

const TEAM = [
  { initials: 'AP', color: '#018156' },
  { initials: 'JF', color: '#2771FF' },
  { initials: 'RK', color: '#d9822b' },
  { initials: 'MS', color: '#9b51e0' },
];

const ROLES = ['Lead', 'Frontend', 'Backend', 'Design'];

const MILESTONES = [
  { name: 'Design review', pct: 72 },
  { name: 'API integration', pct: 45 },
];

const TEAMS = [
  { label: 'ShoeShopper', count: 8, color: '#018156' },
  { label: 'Chatcut', count: 6, color: '#2771FF' },
  { label: 'Anylog', count: 7, color: '#d9822b' },
];

const FloatingCards: React.FC = () => {
  // TSR progress ring geometry (8 of 12 reports submitted).
  const submitted = 8;
  const total = 12;
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - submitted / total);

  return (
    <div className="hero__cards" aria-hidden="true">
      {/* Project team — upper left */}
      <div className="float-card float-card--team">
        <div className="float-card__head">
          <span className="float-card__title">Project Team</span>
          <span className="float-card__meta">4 members</span>
        </div>
        <div className="float-card__avatars">
          {TEAM.map((m) => (
            <span
              key={m.initials}
              className="float-card__avatar"
              style={{ background: m.color }}
            >
              {m.initials}
            </span>
          ))}
        </div>
        <div className="float-card__chips">
          {ROLES.map((role) => (
            <span key={role} className="float-card__chip">
              {role}
            </span>
          ))}
        </div>
      </div>

      {/* Milestones — lower left */}
      <div className="float-card float-card--tasks">
        <div className="float-card__head">
          <span className="float-card__title">Milestones</span>
          <span className="float-card__meta">This sprint</span>
        </div>
        <ul className="float-card__bars">
          {MILESTONES.map((m) => (
            <li key={m.name} className="float-card__bar-row">
              <div className="float-card__bar-top">
                <span>{m.name}</span>
                <strong>{m.pct}%</strong>
              </div>
              <div className="float-card__bar-track">
                <div className="float-card__bar-fill" style={{ width: `${m.pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Weekly TSR progress — upper right */}
      <div className="float-card float-card--tsr">
        <span className="float-card__title">This week&apos;s TSR</span>
        <div className="float-card__ring">
          <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r={radius} className="float-card__ring-track" />
            <circle
              cx="42"
              cy="42"
              r={radius}
              className="float-card__ring-value"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 42 42)"
            />
          </svg>
          <div className="float-card__ring-center">
            <strong>{submitted}</strong>
            <span>/ {total}</span>
          </div>
        </div>
        <span className="float-card__caption">reports submitted</span>
      </div>

      {/* Roster — lower right */}
      <div className="float-card float-card--roster">
        <div className="float-card__head">
          <span className="float-card__title">Class Roster</span>
          <span className="float-card__meta">21 students</span>
        </div>
        <ul className="float-card__rows">
          {TEAMS.map((t) => (
            <li key={t.label} className="float-card__row">
              <span
                className="float-card__row-dot"
                style={{ background: t.color }}
              />
              <span className="float-card__row-text">
                <strong>{t.label}</strong>
              </span>
              <span className="float-card__row-badge">{t.count} students</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default FloatingCards;

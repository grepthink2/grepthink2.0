import React from 'react';
import { AVATAR_COLORS } from '../display/Avatar.jsx';

// One palette everywhere: the hero's decorative avatars use the product's
// AVATAR_COLORS (green, blue-600, amber-700, purple) — no marketing-only hues.
const DEFAULT_TEAM = [
  { initials: 'AP', color: AVATAR_COLORS[0] },
  { initials: 'JF', color: AVATAR_COLORS[1] },
  { initials: 'RK', color: AVATAR_COLORS[2] },
  { initials: 'MS', color: AVATAR_COLORS[3] },
];
const DEFAULT_ROLES = ['Lead', 'Frontend', 'Backend', 'Design'];
const DEFAULT_MILESTONES = [
  { name: 'Design review', pct: 72 },
  { name: 'API integration', pct: 45 },
];
const DEFAULT_TEAMS = [
  { label: 'ShoeShopper', count: 8, color: AVATAR_COLORS[0] },
  { label: 'Chatcut', count: 6, color: AVATAR_COLORS[1] },
  { label: 'Anylog', count: 7, color: AVATAR_COLORS[2] },
];

/**
 * One decorative product-mock card that floats around the hero.
 * kind: 'team' | 'tasks' | 'tsr' | 'roster'. Purely visual, aria-hidden by
 * the parent layer. `inline` drops the absolute placement (galleries).
 */
export function FloatCard({
  kind = 'team',
  title,
  meta,
  team = DEFAULT_TEAM,
  roles = DEFAULT_ROLES,
  milestones = DEFAULT_MILESTONES,
  submitted = 8,
  total = 12,
  caption = 'reports submitted',
  teams = DEFAULT_TEAMS,
  inline = false,
  still = false,
  className = '',
}) {
  const cls = ['gt-float-card', `gt-float-card--${kind}`, inline ? 'gt-float-card--inline' : '', still ? 'gt-float-card--still' : '', className].filter(Boolean).join(' ');

  if (kind === 'tasks') {
    return (
      <div className={cls}>
        <div className="gt-float-card__head">
          <span className="gt-float-card__title">{title ?? 'Milestones'}</span>
          <span className="gt-float-card__meta">{meta ?? 'This sprint'}</span>
        </div>
        <ul className="gt-float-card__bars">
          {milestones.map((m) => (
            <li key={m.name}>
              <div className="gt-float-card__bar-top"><span>{m.name}</span><strong>{m.pct}%</strong></div>
              <div className="gt-float-card__bar-track"><div className="gt-float-card__bar-fill" style={{ width: `${m.pct}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (kind === 'tsr') {
    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - (total ? submitted / total : 0));
    return (
      <div className={cls}>
        <span className="gt-float-card__title">{title ?? "This week's TSR"}</span>
        <div className="gt-float-card__ring">
          <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r={radius} className="gt-float-card__ring-track" />
            <circle cx="42" cy="42" r={radius} className="gt-float-card__ring-value" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 42 42)" />
          </svg>
          <div className="gt-float-card__ring-center"><strong>{submitted}</strong><span>/ {total}</span></div>
        </div>
        <span className="gt-float-card__caption">{caption}</span>
      </div>
    );
  }

  if (kind === 'roster') {
    const students = teams.reduce((s, t) => s + t.count, 0);
    return (
      <div className={cls}>
        <div className="gt-float-card__head">
          <span className="gt-float-card__title">{title ?? 'Class Roster'}</span>
          <span className="gt-float-card__meta">{meta ?? `${students} students`}</span>
        </div>
        <ul className="gt-float-card__rows">
          {teams.map((t) => (
            <li key={t.label} className="gt-float-card__row">
              <span className="gt-float-card__row-dot" style={{ background: t.color }} />
              <span className="gt-float-card__row-text"><strong>{t.label}</strong></span>
              <span className="gt-float-card__row-badge">{t.count} students</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={cls}>
      <div className="gt-float-card__head">
        <span className="gt-float-card__title">{title ?? 'Project Team'}</span>
        <span className="gt-float-card__meta">{meta ?? `${team.length} members`}</span>
      </div>
      <div className="gt-float-card__avatars">
        {team.map((m) => (
          <span key={m.initials} className="gt-float-card__avatar" style={{ background: m.color }}>{m.initials}</span>
        ))}
      </div>
      <div className="gt-float-card__chips">
        {roles.map((r) => <span key={r} className="gt-float-card__chip">{r}</span>)}
      </div>
    </div>
  );
}

/**
 * The hero's default arrangement: team (upper-left), tasks (lower-left),
 * tsr (upper-right), roster (lower-right). Drop into <Hero decor={…}>.
 */
export function FloatingCards({ still = false }) {
  return (
    <React.Fragment>
      <FloatCard kind="team" still={still} />
      <FloatCard kind="tasks" still={still} />
      <FloatCard kind="tsr" still={still} />
      <FloatCard kind="roster" still={still} />
    </React.Fragment>
  );
}

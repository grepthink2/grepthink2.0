import type { HTMLAttributes, ReactNode, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BADGE_CATEGORY, BADGE_STATUS, PROJECT_ROLES, roleKey, type BadgeCategory, type BadgeStatus, type BadgeTone, type ProjectRole,
} from './badgeStatus';
import './Badge.scss';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** The label; defaults to the preset's for `status`, `category` and `projectRole`. */
  children?: ReactNode;
  /** A raw colour, only when no status preset fits. @default 'neutral' */
  tone?: BadgeTone;
  /** A status preset: the feature names the status, BADGE_STATUS picks the colour and the default label. */
  status?: BadgeStatus;
  /** A category label, not a status: the outlined neutral look with an icon. */
  category?: BadgeCategory;
  /**
   * A project role, in the category look with its icon (Owner Crown, Product Owner Star, Scrum Master
   * Shield, Admin Key). Takes the stored spaced values ('product owner') as well as the keys.
   */
  projectRole?: ProjectRole | (string & {});
  /** A leading 12px icon; it overrides the preset's, and `null` drops that. */
  icon?: ReactNode;
  /** Solid fill, for status tones only. @default false */
  solid?: boolean;
  ref?: Ref<HTMLSpanElement>;
}

const presetIcon = (Icon: LucideIcon | null) => (Icon ? <Icon size={12} strokeWidth={2.2} aria-hidden="true" /> : undefined);

/**
 * Status, category and role pill, ported from design/components/display/Badge.jsx. Not interactive.
 * A feature names what the thing is and the presets decide the look: `status` (soft fill and text
 * colour from BADGE_STATUS, with its label), `category` and `projectRole` (white, outlined, a 12px
 * icon). A `status` decides when it is a known key, and an unknown one falls through; then any
 * `projectRole`, then any `category`, which keep their own words when no preset matches. `tone`
 * applies only when none of them decides; children replace the preset's label.
 *
 * It never sets an ARIA role: `projectRole` replaced the design's old `role` prop, so a `role` passed
 * here reaches the DOM like any other attribute. Native props and `ref` reach the span; each
 * projectRole also adds a `gt-badge--role-{key}` class.
 */
export function Badge({
  children, tone = 'neutral', status, category, projectRole, icon, solid = false, className = '', ref, ...rest
}: BadgeProps) {
  let kind = tone;
  let label = children;
  let glyph = icon;
  let outlined = false;
  let roleClass = '';
  if (status && Object.hasOwn(BADGE_STATUS, status)) {
    const [presetTone, presetLabel] = BADGE_STATUS[status];
    kind = presetTone;
    label ??= presetLabel;
  } else if (projectRole) {
    const key = roleKey(projectRole);
    const [Icon, presetLabel] = Object.hasOwn(PROJECT_ROLES, key) ? PROJECT_ROLES[key as ProjectRole] : [null, projectRole];
    outlined = true;
    roleClass = `gt-badge--role-${key}`;
    if (glyph === undefined) glyph = presetIcon(Icon);
    label ??= presetLabel;
  } else if (category) {
    const [Icon, presetLabel] = Object.hasOwn(BADGE_CATEGORY, category) ? BADGE_CATEGORY[category] : [null, category];
    outlined = true;
    if (glyph === undefined) glyph = presetIcon(Icon);
    label ??= presetLabel;
  }
  const cls = [
    'gt-badge', outlined ? 'gt-badge--category' : `gt-badge--${kind}`, solid && !outlined ? 'gt-badge--solid' : '', roleClass, className,
  ].filter(Boolean).join(' ');
  return (
    <span {...rest} ref={ref} className={cls}>
      {glyph ? <span className="gt-badge__icon" aria-hidden="true">{glyph}</span> : null}
      {label}
    </span>
  );
}

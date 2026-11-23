import type { PreviewMeta } from '@components/previewMeta';
import { Badge } from './Badge';
import { BADGE_CATEGORY, BADGE_STATUS, PROJECT_ROLES, type BadgeCategory, type BadgeStatus, type ProjectRole } from './badgeStatus';

export const meta: PreviewMeta = { group: 'Display', height: 1840, subtitle: 'Every status preset, by area' };

// The status presets by area: the part of the key before the dot ("task", "attendance").
const AREAS = Object.keys(BADGE_STATUS).reduce<Record<string, BadgeStatus[]>>((areas, key) => {
  const area = key.includes('.') ? key.slice(0, key.indexOf('.')) : key;
  return { ...areas, [area]: [...(areas[area] ?? []), key as BadgeStatus] };
}, {});

export default function BadgePreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Name the status; the preset picks the colour and the words</p>
        <div className="ds-row">
          <Badge status="task.blocked" />
          <Badge status="assignment.due_soon" />
          <Badge status="attendance.late" />
          <Badge status="pr.merged" />
          <Badge status="request.pending">Invited</Badge>
          <Badge status="release.new" size="sm" />
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Categories and project roles: outlined, with an icon, never a status colour</p>
        <div className="ds-row">
          <Badge category="sponsored" />
          <Badge projectRole="product owner" />
          {(Object.keys(BADGE_CATEGORY) as BadgeCategory[]).filter((key) => key !== 'sponsored').map((key) => (
            <Badge key={key} category={key} />
          ))}
          {(Object.keys(PROJECT_ROLES) as ProjectRole[]).filter((key) => key !== 'product_owner').map((key) => (
            <Badge key={key} projectRole={key} />
          ))}
        </div>
      </section>
      {Object.entries(AREAS).map(([area, keys]) => (
        <section className="ds-section" key={area}>
          <p className="ds-caption">{area}</p>
          <div className="ds-row">
            {keys.map((key) => (
              <span key={key} className="ds-row" style={{ gap: 6 }}>
                <Badge status={key} />
                <code style={{ font: '11px var(--gt-font-mono)', color: 'var(--gt-text-tertiary)' }}>{key}</code>
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

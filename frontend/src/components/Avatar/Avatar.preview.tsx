import type { PreviewMeta } from '@components/previewMeta';
import { Avatar, AvatarGroup } from './Avatar';

export const meta: PreviewMeta = { group: 'Display', height: 290 };

const TEAM = ['Maya Chen', 'Leo Park', 'Ines Ruiz', 'Sam Okafor', 'Priya Nair', 'Tom Alvarez'];

export default function AvatarPreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Sizes: xs 20, sm 28, md 36, lg 48, xl 64. The colour comes from the name</p>
        <div className="ds-row">
          <Avatar name="Maya Chen" size="xs" />
          <Avatar name="Leo Park" size="sm" />
          <Avatar name="Ines Ruiz" />
          <Avatar name="sam.okafor@example.edu" size="lg" />
          <Avatar name="Priya Nair" size="xl" />
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Beside a visible name it is decorative; a project is square</p>
        <div className="ds-row">
          <span className="ds-row">
            <Avatar name="Maya Chen" size="sm" decorative />
            Maya Chen
          </span>
          <Avatar name="Bike Share Map" square />
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">AvatarGroup: past max, the rest collapse to +n</p>
        <div className="ds-row">
          <AvatarGroup names={TEAM} max={4} />
          <AvatarGroup names={TEAM.slice(0, 3)} size="md" />
        </div>
      </section>
    </div>
  );
}

import type { PreviewMeta } from '@components/previewMeta';
import { Icon } from './Icon';

export const meta: PreviewMeta = { group: 'Display', height: 220 };

const COMMON = [
  'Plus', 'Pencil', 'Trash2', 'X', 'Check', 'Search',
  'Clock', 'Users', 'MessageSquare', 'Bell', 'Settings', 'ExternalLink',
];

export default function IconPreview() {
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Twelve of the icons the app uses, by name, at 20px</p>
        <div className="ds-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}>
          {COMMON.map((name) => (
            <span key={name} className="ds-row" style={{ gap: 8 }}>
              <Icon name={name} size={20} aria-hidden="true" />
              <code style={{ font: '12px var(--gt-font-mono)', color: 'var(--gt-text-secondary)' }}>{name}</code>
            </span>
          ))}
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Sizes and colour: an icon takes the text colour around it</p>
        <div className="ds-row">
          <Icon name="Trash2" size={14} aria-hidden="true" />
          <Icon name="Trash2" size={16} aria-hidden="true" />
          <Icon name="Trash2" size={20} aria-hidden="true" />
          <span style={{ color: 'var(--gt-error)' }}><Icon name="Trash2" size={20} aria-label="Delete" /></span>
        </div>
      </section>
    </div>
  );
}

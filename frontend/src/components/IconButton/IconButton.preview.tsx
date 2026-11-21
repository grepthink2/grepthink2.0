import { useState } from 'react';
import { Bold, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { IconButton } from './IconButton';

export const meta: PreviewMeta = { group: 'Primitives', height: 260 };

const close = () => {};

export default function IconButtonPreview() {
  const [bold, setBold] = useState(true);
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Variants: ghost (the default), solid, danger. Hover one for its tooltip</p>
        <div className="ds-row">
          <IconButton ariaLabel="Close" onClick={close}><X size={18} /></IconButton>
          <IconButton ariaLabel="Edit" variant="solid"><Pencil size={18} /></IconButton>
          <IconButton ariaLabel="Delete" variant="danger"><Trash2 size={18} /></IconButton>
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Sizes: sm 28, md 36, lg 44 (solid, so the box shows)</p>
        <div className="ds-row">
          <IconButton ariaLabel="More actions" variant="solid" size="sm"><MoreHorizontal size={16} /></IconButton>
          <IconButton ariaLabel="More actions" variant="solid" size="md"><MoreHorizontal size={18} /></IconButton>
          <IconButton ariaLabel="More actions" variant="solid" size="lg"><MoreHorizontal size={20} /></IconButton>
        </div>
      </section>
      <section className="ds-section">
        <p className="ds-caption">Pressed (click it), disabled</p>
        <div className="ds-row">
          <IconButton ariaLabel="Bold" size="sm" pressed={bold} onClick={() => setBold(!bold)}><Bold size={14} /></IconButton>
          <IconButton ariaLabel="Delete" disabled><Trash2 size={18} /></IconButton>
        </div>
      </section>
    </div>
  );
}

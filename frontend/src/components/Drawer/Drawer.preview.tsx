import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Button } from '@components/Button/Button';
import { Input } from '@components/Input/Input';
import { Drawer } from './Drawer';

export const meta: PreviewMeta = { group: 'Feedback', height: 460, expects: '[role="dialog"]' };

const close = () => {};

export default function DrawerPreview() {
  const [title, setTitle] = useState('Sprint 3 report');
  // In place, the drawer fills its parent: this box stands for the page's height.
  return (
    <div style={{ height: 420, overflow: 'hidden' }}>
      <Drawer
        open
        onClose={close}
        portal={false}
        title="Edit assignment"
        subtitle="CSE 115A · Fall 2026"
        footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button onClick={close}>Save</Button></>}
      >
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Drawer>
    </div>
  );
}

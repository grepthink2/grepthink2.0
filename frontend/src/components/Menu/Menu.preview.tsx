import { useState } from 'react';
import { Info, Link, LogOut, MoreHorizontal, Pencil, Settings, Trash2 } from 'lucide-react';
import type { PreviewMeta } from '@components/previewMeta';
import { Badge } from '@components/Badge/Badge';
import { IconButton } from '@components/IconButton/IconButton';
import { Popover } from '@components/Popover/Popover';
import { Menu, MenuGroup, MenuItem, MenuSeparator } from './Menu';

export const meta: PreviewMeta = { group: 'Feedback', height: 260, expects: '[role="menu"]' };

const SCHOOLS = [
  { id: 'ucsc', name: 'UC Santa Cruz' },
  { id: 'sjsu', name: 'San José State' },
];
const act = () => {};

export default function MenuPreview() {
  const [open, setOpen] = useState(true);
  const [profileOpen, setProfileOpen] = useState(true);
  const [current, setCurrent] = useState('ucsc');
  const close = () => setOpen(false);
  return (
    <div className="ds-row" style={{ alignItems: 'flex-start', gap: 260 }}>
      <Popover
        open={open}
        onClose={close}
        padded={false}
        anchor={<IconButton ariaLabel="Task actions" onClick={() => setOpen(!open)}><MoreHorizontal size={16} /></IconButton>}
      >
        <Menu onClose={close} ariaLabel="Task actions">
          <MenuItem icon={<Pencil size={16} />} onSelect={act}>Edit</MenuItem>
          <MenuItem icon={<Link size={16} />} shortcut="⌘C" onSelect={act}>Copy link</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 size={16} />} destructive onSelect={act}>Delete</MenuItem>
        </Menu>
      </Popover>
      <Popover
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        padded={false}
        anchor={<IconButton ariaLabel="Profile menu" onClick={() => setProfileOpen(!profileOpen)}><Settings size={16} /></IconButton>}
      >
        <Menu onClose={() => setProfileOpen(false)} ariaLabel="Profile">
          <MenuGroup label="School">
            {SCHOOLS.map((s) => (
              <MenuItem key={s.id} radio checked={s.id === current} onSelect={() => setCurrent(s.id)}>{s.name}</MenuItem>
            ))}
          </MenuGroup>
          <MenuSeparator />
          <MenuItem icon={<Info size={16} />} trailing={<Badge status="release.new" size="sm" aria-hidden="true" />} onSelect={act}>
            What's new
          </MenuItem>
          <MenuItem icon={<LogOut size={16} />} destructive onSelect={act}>Log out</MenuItem>
        </Menu>
      </Popover>
    </div>
  );
}

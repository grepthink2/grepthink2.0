import React from 'react';
import { Popover } from '../feedback/Popover.jsx';
import { Menu, MenuItem, MenuGroup, MenuSeparator } from '../feedback/Menu.jsx';
import { Avatar } from '../display/Avatar.jsx';
import { Badge } from '../display/Badge.jsx';
import { NewDot } from '../display/NewDot.jsx';

const I = ({ d, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const UserGlyph = () => <I size={20} d={<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>} />;
const Chevron = () => <I d={<path d="m6 9 6 6 6-6" />} />;
const Eye = () => <I d={<><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>} />;
const Gear = () => <I d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>} />;
const Info = () => <I d={<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>} />;
const LogOutGlyph = () => <I d={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>} />;

/**
 * The app header's profile menu on the kit (What's new, 2026-10-23; `features/app/components/Layout/ProfileMenu.tsx`):
 * today's profile button — the avatar, or a user icon when there is none, and a chevron — with `aria-haspopup="menu"`
 * and `aria-expanded`, over a flush `Popover` (align end) holding a `Menu` (autoFocus). Rows, in order: a "School"
 * group of radio rows for an account at two or more schools (the current one checked; the switcher no longer
 * expands in place), "View class as student" / "Instructor view" in a class the user teaches, "Settings",
 * "ⓘ What's new" with the "New" marker while unseen, a separator, then "Log Out" (destructive). While unseen the
 * avatar carries the NewDot and the button and the row are also described as "New release notes" — their names
 * never change. Keyboard: the Menu pattern (↑ ↓ Home End, Enter); Esc or a pick closes with focus back on the
 * button; tabbing out closes it. "What's new" closes the menu first, so the modal's opener is the profile button.
 */
export function ProfileMenu({
  name = '', avatarUrl, schools = [], currentSchoolId, onPickSchool, teaching = false, previewing = false,
  onTogglePreview, onSettings, onWhatsNew, onLogout, unseen = false, defaultOpen = false, className = '',
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const buttonRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const descId = React.useId();
  // Close; focus goes back to the button only when it would otherwise be lost with the menu (not after an outside click).
  const close = () => {
    setOpen(false);
    const a = document.activeElement;
    if (buttonRef.current && (!a || a === document.body || (wrapRef.current && wrapRef.current.contains(a)))) buttonRef.current.focus();
  };
  const pick = (fn) => () => { close(); if (fn) fn(); };
  const onBlur = (e) => { if (open && wrapRef.current && e.relatedTarget && !wrapRef.current.contains(e.relatedTarget)) setOpen(false); };
  const twoSchools = schools.length > 1;
  const trigger = (
    <button ref={buttonRef} type="button" className="gt-profile-menu__button" aria-label="Profile menu" aria-haspopup="menu" aria-expanded={open}
      aria-describedby={unseen ? descId : undefined} onClick={() => setOpen((v) => !v)}>
      <span className="gt-profile-menu__avatar">
        {avatarUrl ? <Avatar src={avatarUrl} name={name} size="sm" decorative /> : <span className="gt-profile-menu__icon"><UserGlyph /></span>}
        {unseen && <NewDot ring className="gt-profile-menu__dot" />}
      </span>
      <span className="gt-profile-menu__chevron"><Chevron /></span>
    </button>
  );
  return (
    <div className={['gt-profile-menu', className].filter(Boolean).join(' ')} ref={wrapRef} onBlur={onBlur}>
      <Popover open={open} onClose={close} placement="bottom" align="end" padded={false} anchor={trigger}>
        <Menu ariaLabel="Profile" autoFocus onClose={close}>
          {twoSchools && (
            <MenuGroup label="School">
              {schools.map((s) => (
                <MenuItem key={s.id} radio checked={s.id === currentSchoolId} onSelect={pick(() => onPickSchool && onPickSchool(s.id))}>{s.name}</MenuItem>
              ))}
            </MenuGroup>
          )}
          {twoSchools && <MenuSeparator />}
          {teaching && <MenuItem icon={<Eye />} onSelect={pick(onTogglePreview)}>{previewing ? 'Instructor view' : 'View class as student'}</MenuItem>}
          <MenuItem icon={<Gear />} onSelect={pick(onSettings)}>Settings</MenuItem>
          <MenuItem icon={<Info />} trailing={unseen ? <Badge status="release.new" size="sm" aria-hidden="true" /> : null}
            aria-describedby={unseen ? descId : undefined} onSelect={pick(onWhatsNew)}>What's new</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<LogOutGlyph />} destructive onSelect={pick(onLogout)}>Log Out</MenuItem>
        </Menu>
      </Popover>
      {unseen && <span id={descId} className="gt-visually-hidden">New release notes</span>}
    </div>
  );
}

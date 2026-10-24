import { startTransition, useCallback, useId, useRef, useState, type FocusEvent, type MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Eye, Info, LogOut, Settings, User } from 'lucide-react';
import { Avatar } from '@/components/Avatar/Avatar';
import { Badge } from '@/components/Badge/Badge';
import { Menu, MenuGroup, MenuItem, MenuSeparator } from '@/components/Menu/Menu';
import { NewDot } from '@/components/NewDot/NewDot';
import { Popover } from '@/components/Popover/Popover';
import { useAuth } from '@/lib/auth';
import { useClass } from '@/lib/classContext';
import { usePreview } from '@/lib/previewContext';
import { pathAfterClassSwitch } from '@features/app/config/routePermissions';
import { WhatsNewModal } from '@features/releases/components/WhatsNewModal';
import { preloadReleaseFeed } from '@features/releases/loadReleaseFeed';
import { openWhatsNew } from '@features/releases/seenStore';
import { useWhatsNew } from '@features/releases/useWhatsNew';
import './ProfileMenu.scss';

interface ProfileMenuProps {
  /** The profile photo, or null for the user icon. */
  avatarUrl: string | null;
  onOpenSettings: () => void;
}

/**
 * The app header's profile menu, ported from design/components/navigation/ProfileMenu.jsx: the profile
 * button (the avatar or the user icon, and a chevron) over the kit's Popover and Menu. Its rows, in order:
 * a "School" group of radio rows for an account at two or more schools, then a separator; "View class as
 * student" (or "Instructor view") in a class you teach; Settings; "What's new"; a separator and Log Out.
 *
 * While a release is unread the avatar carries the dot, the "What's new" row the "New" marker, and both the
 * button and the row are described as "New release notes"; their names never change. The keyboard is the
 * Menu's: the arrow keys, Home and End move, Enter picks. Esc or a pick closes the menu with focus back on
 * the button, but only when focus would otherwise be lost with it: after an outside click focus stays where
 * the user put it. Tabbing out closes the menu. "What's new" closes the menu first, so the modal's opener is
 * the profile button and focus returns there when it closes.
 */
export default function ProfileMenu({ avatarUrl, onOpenSettings }: ProfileMenuProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { signOut, user } = useAuth();
  const { isPreviewing, enterPreview, exitPreview } = usePreview();
  const { showSchoolSwitcher, schools, currentSchool, selectSchool, selectedClass } = useClass();
  const { unseen } = useWhatsNew();

  const [menuOpen, setMenuOpen] = useState(false);
  const [whatsNew, setWhatsNew] = useState<{ open: boolean; lastSeen: string | null }>({ open: false, lastSeen: null });
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const descriptionId = useId();

  // Every way out but Tab comes through here. Focus still in the menu (Esc, a pick) or already lost goes back
  // to the button first, since the rows unmount; after an outside click the browser then moves it to what was
  // clicked. Stable, so Popover does not re-attach its listeners.
  const close = useCallback(() => {
    const active = document.activeElement;
    const lost = !active || active === document.body || wrapRef.current?.contains(active);
    if (lost) buttonRef.current?.focus({ preventScroll: true });
    setMenuOpen(false);
  }, []);

  const pick = (action: () => void) => () => {
    close();
    action();
  };

  const toggle = () => {
    if (menuOpen) {
      close();
      return;
    }
    preloadReleaseFeed();
    setMenuOpen(true);
  };

  // While the menu is open, pressing the button leaves focus on the row (Chrome would move it to the button,
  // and the blur would close the menu before the click does).
  const onButtonMouseDown = (e: MouseEvent<HTMLButtonElement>) => {
    if (menuOpen) e.preventDefault();
  };

  // Tab and Shift+Tab out of the menu close it. Focus moving to nothing is no way out: Safari, and Firefox on
  // macOS, blur a row that way when it is pressed, and closing then would unmount it before its click.
  const onMenuBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (next && !e.currentTarget.contains(next)) setMenuOpen(false);
  };

  const pickSchool = (schoolId: string) => {
    // One transition for the class and the page (see the sidebar's class switcher).
    startTransition(() => {
      const target = selectSchool(schoolId);
      // Still in the same class (its school picked again): the page already fits, and a preview of that
      // class goes on, so its own role would not be the one the page follows.
      if (!target || target.id === selectedClass?.id) return;
      const next = pathAfterClassSwitch(pathname, target.my_role);
      if (next) navigate(next);
    });
  };

  const togglePreview = () => {
    // One transition for the preview and the page. The router navigates in a transition, so a preview
    // committed on its own would meet the class route guard on the old page, which would redirect from
    // there (the Dashboard to My Project, My Project to the Dashboard).
    startTransition(() => {
      if (isPreviewing) exitPreview();
      else enterPreview();
      navigate('/app/home');
    });
  };

  const openNotes = () => {
    const lastSeen = openWhatsNew();
    setWhatsNew({ open: true, lastSeen });
  };

  const logOut = async () => {
    await signOut();
    navigate('/');
  };

  const button = (
    <button
      ref={buttonRef}
      type="button"
      className="gt-profile-menu__button"
      aria-label="Profile menu"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-describedby={unseen ? descriptionId : undefined}
      onMouseDown={onButtonMouseDown}
      onClick={toggle}
    >
      <span className="gt-profile-menu__avatar">
        {avatarUrl ? (
          <Avatar src={avatarUrl} name={user?.email ?? ''} size="sm" decorative />
        ) : (
          <span className="gt-profile-menu__icon">
            <User size={20} aria-hidden="true" />
          </span>
        )}
        {unseen && <NewDot ring className="gt-profile-menu__dot" />}
      </span>
      <span className="gt-profile-menu__chevron">
        <ChevronDown size={16} aria-hidden="true" />
      </span>
    </button>
  );

  return (
    <div className="gt-profile-menu" ref={wrapRef}>
      <Popover open={menuOpen} onClose={close} anchor={button} placement="bottom" align="end" padded={false}>
        <Menu ariaLabel="Profile" autoFocus onClose={close} onBlur={onMenuBlur}>
          {showSchoolSwitcher && (
            <>
              <MenuGroup label="School">
                {schools.map((school) => (
                  <MenuItem
                    key={school.id}
                    radio
                    checked={school.id === currentSchool?.id}
                    onSelect={pick(() => pickSchool(school.id))}
                  >
                    {school.name}
                  </MenuItem>
                ))}
              </MenuGroup>
              <MenuSeparator />
            </>
          )}
          {/* Only in a class you own: the class's own role, which preview does not change. */}
          {selectedClass?.my_role === 'instructor' && (
            <MenuItem icon={<Eye size={16} aria-hidden="true" />} onSelect={pick(togglePreview)}>
              {isPreviewing ? 'Instructor view' : 'View class as student'}
            </MenuItem>
          )}
          <MenuItem icon={<Settings size={16} aria-hidden="true" />} onSelect={pick(onOpenSettings)}>
            Settings
          </MenuItem>
          <MenuItem
            icon={<Info size={16} aria-hidden="true" />}
            trailing={unseen ? <Badge status="release.new" size="sm" aria-hidden="true" /> : undefined}
            aria-describedby={unseen ? descriptionId : undefined}
            onSelect={pick(openNotes)}
          >
            What&apos;s new
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<LogOut size={16} aria-hidden="true" />} destructive onSelect={pick(() => void logOut())}>
            Log Out
          </MenuItem>
        </Menu>
      </Popover>
      {unseen && <span id={descriptionId} className="gt-visually-hidden">New release notes</span>}
      <WhatsNewModal
        open={whatsNew.open}
        onClose={() => setWhatsNew((current) => ({ ...current, open: false }))}
        tone="light"
        lastSeen={whatsNew.lastSeen}
      />
    </div>
  );
}

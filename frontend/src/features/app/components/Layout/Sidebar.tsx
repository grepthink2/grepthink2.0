import React, { useState, useRef, useEffect, startTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, GraduationCap } from 'lucide-react';
import { activeItemPath, buildSidebarConfig, SIDEBAR_HOVER } from '../../config/sidebar';
import { CLASS_ROLE_LABELS, pathAfterClassSwitch } from '../../config/routePermissions';
import { useAuth } from '@/lib/auth';
import { useClass, useSelectedClassRole } from '@/lib/classContext';
import { usePreview } from '@/lib/previewContext';
import { useUnreadTotal } from '@features/messages/hooks/useUnreadTotal';
import logo from '@assets/grepthink l logo.svg?url';
import mark from '@assets/grepthink-mark.svg?url';
import './Sidebar.scss';

interface SidebarProps {
  onOpenCreateClass?: () => void;
  onOpenJoinClass?: () => void;
  onOpenSettings?: () => void;
  /** Whether the off-canvas drawer is open (mobile only). */
  mobileOpen?: boolean;
  /** Close the mobile drawer (called after navigating). */
  onMobileClose?: () => void;
}

/** Phones get the off-canvas drawer instead of the rail. */
const MOBILE_QUERY = '(max-width: 768px)';
/** A touch screen cannot hover, so the sidebar stays open on it. */
const NO_HOVER_QUERY = '(hover: none)';

const matches = (query: string) => typeof window !== 'undefined' && window.matchMedia(query).matches;

const Sidebar: React.FC<SidebarProps> = ({ onOpenCreateClass, onOpenJoinClass, onOpenSettings, mobileOpen, onMobileClose }) => {
  const [isMobile, setIsMobile] = useState(() => matches(MOBILE_QUERY));
  const [noHover, setNoHover] = useState(() => matches(NO_HOVER_QUERY));
  const [hovered, setHovered] = useState(false);
  const [focusHeld, setFocusHeld] = useState(false);
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  // A pointer pressed on the sidebar: the focus it gives is the pointer's doing, not the keyboard's.
  const pointerPressed = useRef(false);

  const { canCreateClasses } = useAuth();
  const { isPreviewing } = usePreview();
  const classRole = useSelectedClassRole();
  const { sidebarClasses, selectedClass, setSelectedClass, showSchoolSwitcher } = useClass();
  const unreadTotal = useUnreadTotal();

  // The top sections follow what the account can do, except that "View class as student" shows
  // a student account's; the class section, your role in the selected class (TAs get the student
  // groups plus "TA Review").
  const sidebarConfig = React.useMemo(
    () => buildSidebarConfig({ canCreateClasses: canCreateClasses && !isPreviewing, classRole }),
    [canCreateClasses, isPreviewing, classRole],
  );
  const activePath = activeItemPath(sidebarConfig, location.pathname);
  // Label each class with your role only when the list mixes roles.
  const mixedRoles = new Set(sidebarClasses.map((c) => c.my_role)).size > 1;

  // Follow the breakpoints: the phone drawer and a touch screen's sidebar are always open.
  useEffect(() => {
    const mobile = window.matchMedia(MOBILE_QUERY);
    const hoverless = window.matchMedia(NO_HOVER_QUERY);
    const onMobile = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    const onHoverless = (event: MediaQueryListEvent) => setNoHover(event.matches);
    mobile.addEventListener('change', onMobile);
    hoverless.addEventListener('change', onHoverless);
    return () => {
      mobile.removeEventListener('change', onMobile);
      hoverless.removeEventListener('change', onHoverless);
    };
  }, []);

  // The rail's timers die with it.
  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current);
      window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // The desktop rail opens once the pointer has rested on it and closes a moment after the pointer
  // leaves. Keyboard focus inside it holds it open (the focus a click gives does not: the pointer
  // decides then), and so does the open class menu.
  const expanded = isMobile || noHover || hovered || focusHeld || showClassDropdown;

  const handlePointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return;
    window.clearTimeout(closeTimer.current);
    if (hovered) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => setHovered(true), SIDEBAR_HOVER.openDelayMs);
  };

  const handlePointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType === 'touch') return;
    window.clearTimeout(openTimer.current);
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHovered(false), SIDEBAR_HOVER.closeDelayMs);
  };

  const handleFocus = () => {
    if (pointerPressed.current) return;
    setFocusHeld(true);
  };

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setFocusHeld(false);
  };

  /** The interaction is over: the pointer decides again, whatever stays focused in the sidebar. */
  const releaseFocusHold = () => setFocusHeld(false);

  // Browser tab title prefix — `(N) GrepThink` when there are unread messages.
  useEffect(() => {
    if (unreadTotal > 0) {
      document.title = `(${unreadTotal}) GrepThink`;
    } else {
      document.title = 'GrepThink';
    }
  }, [unreadTotal]);

  const handleNavigation = (path: string) => {
    if (path === '/app/create-class' && onOpenCreateClass) {
      onOpenCreateClass();
    } else if (path === '/app/join-class' && onOpenJoinClass) {
      onOpenJoinClass();
    } else if (path === '/app/settings' && onOpenSettings) {
      onOpenSettings();
    } else if (path === '/app/help-center') {
      window.open('/contact', '_blank', 'noopener,noreferrer');
    } else {
      navigate(path);
    }
    releaseFocusHold();
    // Close the off-canvas drawer after a selection on mobile.
    onMobileClose?.();
  };

  const handleClassSelect = (classItem: (typeof sidebarClasses)[number]) => {
    setShowClassDropdown(false);
    releaseFocusHold();
    // Stay on this page when your role in the new class allows it, else go to that role's page.
    // The class you are already in needs neither (a preview of it goes on, so its own role
    // would not be the one the page follows).
    const next =
      classItem.id === selectedClass?.id ? null : pathAfterClassSwitch(location.pathname, classItem.my_role);
    // One transition for the class and the page. The router navigates in a transition, so a class
    // committed on its own would first show the old page with the new class (a detail page would
    // fetch its id in the wrong class) or meet the class route guard there.
    startTransition(() => {
      setSelectedClass(classItem);
      if (next) navigate(next);
    });
  };

  // A press outside the menu closes it; one outside the sidebar lets go of the focus hold too.
  useEffect(() => {
    const handlePressOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setShowClassDropdown(false);
      }
      if (sidebarRef.current && !sidebarRef.current.contains(target)) {
        setFocusHeld(false);
      }
    };

    document.addEventListener('mousedown', handlePressOutside);
    return () => document.removeEventListener('mousedown', handlePressOutside);
  }, []);

  return (
    <div
      ref={sidebarRef}
      className={`sidebar${expanded ? ' expanded' : ''}${mobileOpen ? ' mobile-open' : ''}`}
      data-expanded={expanded}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDownCapture={() => {
        pointerPressed.current = true;
      }}
      onPointerUpCapture={() => {
        pointerPressed.current = false;
      }}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {/* Brand: the mark alone in the rail, the wordmark once open */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <img className="sidebar-brand__mark" src={mark} alt="" />
          <img className="sidebar-brand__logo" src={logo} alt="GrepThink" />
        </div>
      </div>

      {/* Class Selector: an icon tile in the rail, the class's name and its menu once open */}
      <div className="class-selector" ref={dropdownRef}>
        <button
          className="class-selector-header"
          onClick={() => setShowClassDropdown(!showClassDropdown)}
          aria-expanded={showClassDropdown}
        >
          <GraduationCap size={18} className="class-selector-icon" />
          <span className="class-selector-title">
            <span className="class-name">{selectedClass ? selectedClass.name : 'No class selected'}</span>
            {showSchoolSwitcher && selectedClass?.institution && (
              <span className="class-school">{selectedClass.institution.name}</span>
            )}
          </span>
          <ChevronDown size={16} className={`class-selector-chevron${showClassDropdown ? ' rotated' : ''}`} />
        </button>

        {showClassDropdown && (
          <div className="class-selector-dropdown">
            {sidebarClasses.length === 0 ? (
              <div className="class-selector-empty">No active classes</div>
            ) : (
              sidebarClasses.map((classItem) => (
                <button
                  key={classItem.id}
                  className={`class-selector-item ${selectedClass?.id === classItem.id ? 'active' : ''}`}
                  onClick={() => handleClassSelect(classItem)}
                >
                  <div className="class-item-name">{classItem.name}</div>
                  <div className="class-item-code">{classItem.course_code}</div>
                  {mixedRoles && <div className="class-item-role">{CLASS_ROLE_LABELS[classItem.my_role]}</div>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Navigation: sections of category groups; a heading is a divider while the rail is closed */}
      <nav className="sidebar-nav">
        {sidebarConfig.map((section) => (
          <div key={section.id} className={`sidebar-section sidebar-section--${section.id}`}>
            {section.title && (
              <h3 className="section-title">
                <span>{section.id === 'class' && selectedClass ? selectedClass.name : section.title}</span>
              </h3>
            )}
            {section.groups.map((group, index) => (
              <div key={group.title ?? index} className="sidebar-group">
                {group.title && (
                  <h4 className="group-title">
                    <span>{group.title}</span>
                  </h4>
                )}
                <ul className="section-items">
                  {group.items.map((item) => {
                    const isActive = item.path === activePath;
                    return (
                      <li key={item.path}>
                        <button
                          className={`sidebar-item${isActive ? ' active' : ''}`}
                          onClick={() => handleNavigation(item.path)}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          {React.createElement(item.icon, { size: 18 })}
                          <span className="sidebar-item__label">{item.label}</span>
                          {item.path === '/app/messages' && unreadTotal > 0 && (
                            <span className="sidebar-item__badge">{unreadTotal}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;

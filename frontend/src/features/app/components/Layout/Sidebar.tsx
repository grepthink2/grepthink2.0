import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { PanelLeft } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { buildSidebarConfig, type SidebarItem } from '../../config/sidebar';
import { CLASS_ROLE_LABELS, pathAfterClassSwitch } from '../../config/routePermissions';
import { useAuth } from '@/lib/auth';
import { useClass, useSelectedClassRole } from '@/lib/classContext';
import { useUnreadTotal } from '@features/messages/hooks/useUnreadTotal';
import logo from '@assets/grepthink l logo.svg?url';
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

const Sidebar: React.FC<SidebarProps> = ({ onOpenCreateClass, onOpenJoinClass, onOpenSettings, mobileOpen, onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { canCreateClasses } = useAuth();
  const classRole = useSelectedClassRole();
  const { sidebarClasses, selectedClass, setSelectedClass, showSchoolSwitcher } = useClass();
  const unreadTotal = useUnreadTotal();

  // The main section follows what the account can do; the class section, your role in the
  // selected class (TAs get the student items plus "TA Review").
  const sidebarConfig = React.useMemo(
    () => buildSidebarConfig({ canCreateClasses, classRole }),
    [canCreateClasses, classRole],
  );
  // Label each class with your role only when the list mixes roles.
  const mixedRoles = new Set(sidebarClasses.map((c) => c.my_role)).size > 1;

  // Expandable items (those with children): open/closed state, keyed by path.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (path: string) =>
    setOpenGroups((prev) => ({ ...prev, [path]: !(prev[path] ?? false) }));

  // A child link is active on its path and any deeper route under it. The
  // group's own path (e.g. "TSRs" → /app/ta-review) also owns its nested
  // routes — minus any claimed by a sibling child (…/final-reviews).
  const isChildActive = (item: SidebarItem, child: SidebarItem) => {
    const path = location.pathname;
    if (path === child.path) return true;
    if (child.path !== item.path) return path.startsWith(`${child.path}/`);
    return (
      path.startsWith(`${item.path}/`) &&
      !(item.children ?? []).some((c) => c.path !== item.path && path.startsWith(c.path))
    );
  };

  // Track the mobile breakpoint so the desktop collapse affordance never
  // applies to the off-canvas drawer (which would hide its labels/logo).
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // On mobile the sidebar is a full-width drawer — always render it expanded.
  const collapsed = isCollapsed && !isMobile;

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
    // Close the off-canvas drawer after a selection on mobile.
    onMobileClose?.();
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleClassSelect = (classItem: (typeof sidebarClasses)[number]) => {
    const switching = classItem.id !== selectedClass?.id;
    setSelectedClass(classItem);
    setShowClassDropdown(false);
    // Stay on this page when your role in the new class allows it, else go to that role's page.
    // The class you are already in needs neither (a preview of it goes on, so its own role
    // would not be the one the page follows).
    if (!switching) return;
    const next = pathAfterClassSwitch(location.pathname, classItem.my_role);
    if (next) navigate(next);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowClassDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''} ${classRole === 'instructor' ? 'instructor' : 'student'}`}>
      {/* Header with Logo */}
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-logo">
            <img src={logo} alt="GrepThink Logo" />
          </div>
        )}
        <button className="collapse-button" onClick={toggleCollapse}>
          <PanelLeft size={20} />
        </button>
      </div>

      {/* Class Selector */}
      {!collapsed && (
        <div className="class-selector" ref={dropdownRef}>
          <button
            className="class-selector-header"
            onClick={() => setShowClassDropdown(!showClassDropdown)}
          >
            <span className="class-selector-title">
              <span className="class-name">{selectedClass ? selectedClass.name : 'No class selected'}</span>
              {showSchoolSwitcher && selectedClass?.institution && (
                <span className="class-school">{selectedClass.institution.name}</span>
              )}
            </span>
            <ChevronDown size={16} className={showClassDropdown ? 'rotated' : ''} />
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
      )}

      {/* Navigation Sections */}
      <nav className="sidebar-nav">
        {sidebarConfig.map((section) => (
          <div key={section.title} className="sidebar-section">
            {!collapsed && (
              <h3 className="section-title">
                {section.title === 'Class' && selectedClass
                  ? `Class: ${selectedClass.name}`
                  : section.title}
              </h3>
            )}
            <ul className="section-items">
              {section.items.map((item) => {
                // Expandable item: a chevron toggle revealing nested child links.
                if (item.children?.length) {
                  const anyChildActive = item.children.some((c) => isChildActive(item, c));
                  // Once a child is active, the group is forced open — closing it would
                  // hide the page you're currently on with no way back short of
                  // navigating elsewhere and back. Trade-off: a group can no longer be
                  // manually collapsed while one of its children is active (matches how
                  // every mainstream sidebar with active-aware groups behaves).
                  const open = (openGroups[item.path] ?? false) || anyChildActive;
                  const groupId = `sidebar-group-${item.path}`;
                  return (
                    <li key={item.path}>
                      <button
                        className={`sidebar-item sidebar-item--group ${collapsed && anyChildActive ? 'active' : ''}`}
                        // Collapsed rail has nowhere to show children — go to the first one.
                        onClick={() => {
                          if (collapsed) return handleNavigation(item.children![0].path);
                          // Forced open while a child is active — a toggle here can't
                          // change anything now, but the stored flip would wrongly keep
                          // the group expanded after navigating away. No-op instead.
                          if (anyChildActive) return;
                          toggleGroup(item.path);
                        }}
                        title={collapsed ? item.label : undefined}
                        aria-expanded={collapsed ? undefined : open}
                        aria-controls={collapsed ? undefined : groupId}
                      >
                        {item.icon ? (
                          React.createElement(item.icon, { size: 18 })
                        ) : item.iconSvg ? (
                          <img src={item.iconSvg} alt={item.label} className="icon-svg" />
                        ) : null}
                        {!collapsed && <span>{item.label}</span>}
                        {!collapsed && (
                          <ChevronDown size={16} className={`sidebar-item__chevron ${open ? 'rotated' : ''}`} />
                        )}
                      </button>
                      {!collapsed && (
                        // Always mounted (not gated on `open`) so the grid-rows
                        // transition below has something to animate between — an
                        // unmount/remount on toggle would jump instantly instead.
                        // `inert` while closed keeps the (visually clipped but still
                        // in the DOM) child links out of the tab order.
                        <div
                          className={`sidebar-subitems-wrap ${open ? 'open' : ''}`}
                          id={groupId}
                          inert={!open}
                        >
                          <ul className="sidebar-subitems">
                            {item.children.map((child) => (
                              <li key={child.path}>
                                <button
                                  className={`sidebar-item sidebar-item--child ${isChildActive(item, child) ? 'active' : ''}`}
                                  onClick={() => handleNavigation(child.path)}
                                >
                                  <span>{child.label}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  );
                }

                const isProjectsItem = item.path === '/app/projects';
                // Flat items own their nested routes too (e.g. the instructor's
                // "Final Reviews" item stays lit on a team's review page).
                let isActive =
                  location.pathname === item.path ||
                  location.pathname.startsWith(`${item.path}/`);

                // For instructors, keep "Projects" highlighted when viewing
                // project details or create-project flows under the class.
                if (classRole === 'instructor' && isProjectsItem) {
                  const path = location.pathname;
                  if (
                    path === '/app/projects' ||
                    path.startsWith('/app/projects/') ||
                    path === '/app/create-project'
                  ) {
                    isActive = true;
                  }
                }

                return (
                  <li key={item.path}>
                    <button
                      className={`sidebar-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleNavigation(item.path)}
                      title={collapsed ? item.label : undefined}
                    >
                      {item.icon ? (
                        React.createElement(item.icon, { size: 18 })
                      ) : item.iconSvg ? (
                        <img src={item.iconSvg} alt={item.label} className="icon-svg" />
                      ) : null}
                      {!collapsed && <span>{item.label}</span>}
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
      </nav>
    </div>
  );
};

export default Sidebar;

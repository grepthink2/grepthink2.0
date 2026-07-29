import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TbLayoutSidebar } from "react-icons/tb";
import { ChevronDown } from 'lucide-react';
import { instructorSidebarConfig, studentSidebarConfig, type SidebarItem, type SidebarSection, type UserRole } from '../../config/sidebar';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import { useUnreadTotal } from '@features/messages/hooks/useUnreadTotal';
import logo from '@assets/grepthink l logo.svg?url';
import ModulesIcon from '@assets/streamline-ultimate_module-three-bold.svg?url';
import './Sidebar.scss';

interface SidebarProps {
  role: UserRole;
  onOpenCreateClass?: () => void;
  onOpenJoinClass?: () => void;
  onOpenSettings?: () => void;
  /** Whether the off-canvas drawer is open (mobile only). */
  mobileOpen?: boolean;
  /** Close the mobile drawer (called after navigating). */
  onMobileClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ role, onOpenCreateClass, onOpenJoinClass, onOpenSettings, mobileOpen, onMobileClose }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { sidebarClasses, selectedClass, setSelectedClass } = useClass();
  const unreadTotal = useUnreadTotal();
  // Students who are a TA in the selected class get an extra "TA Review" nav item.
  const [isTaForClass, setIsTaForClass] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const classId = role === 'student' ? selectedClass?.id : undefined;
    void (async () => {
      if (!classId) {
        // Resolved in the async tick (not the effect body) so the lint-guarded
        // cascading-render pattern is avoided; net behavior is identical.
        if (!cancelled) setIsTaForClass(false);
        return;
      }
      try {
        const { enrollment_role } = await api.getMyEnrollmentRole(classId);
        if (!cancelled) setIsTaForClass(enrollment_role === 'ta');
      } catch {
        if (!cancelled) setIsTaForClass(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, selectedClass?.id]);

  const sidebarConfig: SidebarSection[] = React.useMemo(() => {
    if (role === 'instructor') return instructorSidebarConfig;
    if (!isTaForClass) return studentSidebarConfig;
    // Append "TA Review" to the student "Class" section without mutating config.
    return studentSidebarConfig.map((section) =>
      section.title === 'Class'
        ? {
            ...section,
            items: [
              ...section.items,
              {
                label: 'TA Review',
                path: '/app/ta-review',
                iconSvg: ModulesIcon,
                children: [
                  { label: 'TSRs', path: '/app/ta-review' },
                  { label: 'Final Reviews', path: '/app/ta-review/final-reviews' },
                ],
              },
            ],
          }
        : section,
    );
  }, [role, isTaForClass]);

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
    setSelectedClass(classItem);
    setShowClassDropdown(false);
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
    <div className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''} ${role === 'instructor' ? 'instructor' : 'student'}`}>
      {/* Header with Logo */}
      <div className="sidebar-header">
        {!collapsed && (
          <div className="sidebar-logo">
            <img src={logo} alt="GrepThink Logo" />
          </div>
        )}
        <button className="collapse-button" onClick={toggleCollapse}>
          <TbLayoutSidebar size={20} />
        </button>
      </div>

      {/* Class Selector */}
      {!collapsed && (
        <div className="class-selector" ref={dropdownRef}>
          <button
            className="class-selector-header"
            onClick={() => setShowClassDropdown(!showClassDropdown)}
          >
            <span className="class-name">
              {selectedClass ? selectedClass.name : 'No class selected'}
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
                        onClick={() => (collapsed ? handleNavigation(item.children![0].path) : toggleGroup(item.path))}
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
                if (role === 'instructor' && isProjectsItem) {
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

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TbLayoutSidebar } from "react-icons/tb";
import { ChevronDown } from 'lucide-react';
import { instructorSidebarConfig, studentSidebarConfig, type SidebarSection, type UserRole } from '../../config/sidebar';
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
    if (role !== 'student' || !selectedClass?.id) {
      setIsTaForClass(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { enrollment_role } = await api.getMyEnrollmentRole(selectedClass.id);
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
              { label: 'TA Review', path: '/app/ta-review', iconSvg: ModulesIcon },
            ],
          }
        : section,
    );
  }, [role, isTaForClass]);

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
                const isProjectsItem = item.path === '/app/projects';
                let isActive = location.pathname === item.path;

                // Keep "TA Review" highlighted on its nested assignment routes.
                if (item.path === '/app/ta-review' && location.pathname.startsWith('/app/ta-review')) {
                  isActive = true;
                }

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

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Search, User, ChevronDown, Settings, LogOut, Copy, Check } from 'lucide-react';
import BellIcon from '@assets/mingcute_notification-fill.svg';
import { useClass } from '@/lib/classContext';
import { useNotifications } from '@features/notifications/hooks/useNotifications';
import { formatRelativeTime } from '@features/messages/utils/relativeTime';
import './Header.scss';

function notificationPath(notification: {
  type: string;
  entity_type: string | null;
  entity_id: string | null;
}): string | null {
  if (notification.type === 'complete_profile') return null;
  if (notification.type === 'upload_roster') return '/app/roster';
  if (notification.entity_type === 'conversation' && notification.entity_id) {
    return `/app/messages/${notification.entity_id}`;
  }
  if (notification.entity_type === 'project' && notification.entity_id) {
    return `/app/projects/${notification.entity_id}`;
  }
  return null;
}

const pageTitles: Record<string, string> = {
  '/app/home': 'Home',
  '/app/messages': 'Messages',
  '/app/my-classes': 'My Classes',
  '/app/class-settings': 'Class Settings',
  '/app/join-class': 'Join Class',
  '/app/settings': 'Settings',
  '/app/help-center': 'Help Center',
};

interface BreadcrumbSegment {
  label: string;
  /** If provided, renders as a clickable button that navigates to this path. */
  path?: string;
}

/**
 * Returns an ordered array of breadcrumb segments for class-contextual routes,
 * or null for routes that have no class breadcrumb (standalone pages like Home).
 *
 * Adding a new route: just add a case in the instructor or student block below.
 */
function buildBreadcrumbs(
  pathname: string,
  role: string | null,
  className: string | undefined,
  locationState: unknown,
): BreadcrumbSegment[] | null {
  if (!className) return null;

  const state = locationState as { projectName?: string; assignmentName?: string } | null;

  // Class root segment — instructor links to Dashboard, students have no dedicated class home
  const classSegment: BreadcrumbSegment = {
    label: className,
    path: role === 'instructor' ? '/app/dashboard' : undefined,
  };

  // ── Shared detail routes (role determines the parent crumb) ──────────────
  if (pathname.startsWith('/app/projects/') && pathname !== '/app/projects') {
    const projectName = state?.projectName;
    const parentLabel = role === 'instructor' ? 'Projects' : 'Browse Projects';
    const parentPath = role === 'instructor' ? '/app/projects' : '/app/browse-projects';
    return [
      classSegment,
      { label: parentLabel, path: parentPath },
      { label: projectName ?? 'Project' },
    ];
  }

  if (pathname.startsWith('/app/assignments/') && pathname !== '/app/assignments') {
    const assignmentName = state?.assignmentName;
    return [
      classSegment,
      { label: 'Assignments', path: '/app/assignments' },
      { label: assignmentName ?? 'Assignment' },
    ];
  }

  if (pathname.startsWith('/app/modules/tsr/')) {
    const assignmentName = state?.assignmentName;
    return [
      classSegment,
      { label: 'Modules', path: '/app/modules' },
      { label: assignmentName ?? 'TSR Responses' },
    ];
  }

  // ── Instructor routes ────────────────────────────────────────────────────
  if (role === 'instructor') {
    if (pathname === '/app/dashboard')     return [classSegment, { label: 'Dashboard' }];
    if (pathname === '/app/projects')      return [classSegment, { label: 'Projects' }];
    if (pathname === '/app/roster')        return [classSegment, { label: 'Roster' }];
    if (pathname === '/app/modules')       return [classSegment, { label: 'Modules' }];
    if (pathname === '/app/ta-management') return [classSegment, { label: 'TA Management' }];
    if (pathname === '/app/assignments')   return [classSegment, { label: 'Assignments' }];
    if (pathname === '/app/create-project') {
      return [classSegment, { label: 'Projects', path: '/app/projects' }, { label: 'Create Project' }];
    }
    // Project subroutes
    if (pathname === '/app/assign-projects') {
      return [classSegment, { label: 'Projects', path: '/app/projects' }, { label: 'Assign Projects' }];
    }
    if (pathname === '/app/staff-projects') {
      return [classSegment, { label: 'Projects', path: '/app/projects' }, { label: 'Staffing' }];
    }
  }

  // ── Student routes ───────────────────────────────────────────────────────
  if (role === 'student') {
    if (pathname === '/app/browse-projects') return [classSegment, { label: 'Browse Projects' }];
    if (pathname === '/app/my-project')      return [classSegment, { label: 'My Project' }];
    if (pathname === '/app/assignments')     return [classSegment, { label: 'Assignments' }];
    if (pathname === '/app/create-project')  return [classSegment, { label: 'Create Project' }];
  }

  return null;
}

interface HeaderProps {
  onOpenSettings: () => void;
}

const Header: React.FC<HeaderProps> = ({ onOpenSettings }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, role } = useAuth();
  const { selectedClass, classes, setSelectedClass } = useClass();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const {
    notifications,
    unreadCount,
    loading: notificationsLoading,
    markRead,
  } = useNotifications();

  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const path = location.pathname;

  const breadcrumbs = buildBreadcrumbs(path, role, selectedClass?.name, location.state);
  const isClassRoute = breadcrumbs !== null;
  const showInstructorClassMeta = isClassRoute && role === 'instructor';
  const standaloneTitle = pageTitles[path] ?? 'GrepThink';

  const handleNotificationClick = async (notification: typeof notifications[number]) => {
    if (!notification.read_at) {
      try {
        await markRead(notification.id);
      } catch {
        // Non-fatal — navigation still proceeds.
      }
    }
    setShowNotifications(false);

    if (notification.type === 'complete_profile') {
      onOpenSettings();
      return;
    }

    if (notification.type === 'upload_roster' && notification.entity_id) {
      const cls = classes.find(c => c.id === notification.entity_id);
      if (cls) setSelectedClass(cls);
    }

    const path = notificationPath(notification);
    if (path) navigate(path);
  };

  // Close dropdowns when clicking outside
  const handleCopyCode = () => {
    if (selectedClass?.course_code) {
      navigator.clipboard.writeText(selectedClass.course_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const handleSettingsClick = () => {
    setShowProfileMenu(false);
    onOpenSettings();
  };

  return (
    <header className={`app-header${isClassRoute ? ' app-header--class' : ''}`}>
      {/* Left: Page Title */}
      <div className="app-header__title-block">
        <h1 className="app-header__page-title">
          {breadcrumbs ? (
            breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="app-header__breadcrumb-separator"> &gt; </span>}
                {crumb.path ? (
                  <button
                    type="button"
                    className="app-header__breadcrumb-link"
                    onClick={() => navigate(crumb.path!)}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className="app-header__breadcrumb-rest">{crumb.label}</span>
                )}
              </React.Fragment>
            ))
          ) : (
            standaloneTitle
          )}
        </h1>
        {showInstructorClassMeta && selectedClass && (
          <div className="app-header__class-meta">
            {selectedClass.description && (
              <span className="app-header__class-term">{selectedClass.description}</span>
            )}
            {selectedClass.course_code && (
              <>
                {selectedClass.description && (
                  <span className="app-header__meta-dot">•</span>
                )}
                <span className="app-header__meta-label">Access Code:</span>
                <button
                  type="button"
                  className={`app-header__access-pill${
                    copiedCode ? ' app-header__access-pill--copied' : ''
                  }`}
                  onClick={handleCopyCode}
                  aria-label="Copy access code"
                  title="Copy access code"
                >
                  <span className="app-header__access-code">
                    {selectedClass.course_code}
                  </span>
                  <span
                    className={`app-header__copy-btn${
                      copiedCode ? ' app-header__copy-btn--copied' : ''
                    }`}
                    aria-hidden="true"
                  >
                    {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  </span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right: Notifications, Search Bar & Profile */}
      <div className="app-header__right">
        {/* Notifications */}
        <div className="app-header__notification-container" ref={notificationRef}>
          <button
            className="app-header__icon-button"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label="Notifications"
          >
            <img src={BellIcon} alt="Notifications" width={20} height={20} />
            {unreadCount > 0 && (
              <span className="app-header__notification-badge">{unreadCount}</span>
            )}
          </button>

          {showNotifications && (
            <div className="app-header__dropdown app-header__notifications-dropdown">
              <div className="app-header__dropdown-header">
                <h3>Notifications</h3>
              </div>
              <div className="app-header__dropdown-content">
                {notificationsLoading && notifications.length === 0 ? (
                  <div className="app-header__empty-state">Loading…</div>
                ) : notifications.length === 0 ? (
                  <div className="app-header__empty-state">No notifications</div>
                ) : (
                  notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={`app-header__notification-item ${!notification.read_at ? 'unread' : ''}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="app-header__notification-title">{notification.title}</div>
                      <div className="app-header__notification-content">{notification.body}</div>
                      <div className="app-header__notification-time">
                        {formatRelativeTime(notification.created_at)}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="app-header__search-bar">
          <Search size={18} className="app-header__search-icon" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="app-header__search-input"
          />
        </div>

        {/* Profile Dropdown */}
        <div className="app-header__profile-container" ref={profileRef}>
          <button
            className="app-header__profile-button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            aria-label="Profile menu"
          >
            <div className="app-header__profile-icon">
              <User size={20} />
            </div>
            <ChevronDown size={16} className="app-header__chevron-icon" />
          </button>

          {showProfileMenu && (
            <div className="app-header__dropdown app-header__profile-dropdown">
              <button
                className="app-header__dropdown-item"
                onClick={handleSettingsClick}
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>
              <button
                className="app-header__dropdown-item app-header__dropdown-item--logout"
                onClick={handleLogout}
              >
                <LogOut size={18} />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;

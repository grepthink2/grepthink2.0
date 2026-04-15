import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Search, User, ChevronDown, Settings, LogOut, Copy, Check } from 'lucide-react';
import BellIcon from '@assets/mingcute_notification-fill.svg';
import { useClass } from '@/lib/classContext';
import './Header.scss';

interface Notification {
  id: string;
  type: 'message' | 'alert' | 'info';
  title: string;
  content: string;
  time: string;
  read: boolean;
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

const Header: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, role } = useAuth();
  const { selectedClass } = useClass();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  
  // Mock notification data
  const [notifications] = useState<Notification[]>([
    {
      id: '1',
      type: 'message',
      title: 'New Message',
      content: 'You have a new message from your instructor',
      time: '5 minutes ago',
      read: false,
    }
  ]);

  const notificationRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const path = location.pathname;

  const breadcrumbs = buildBreadcrumbs(path, role, selectedClass?.name, location.state);
  const isClassRoute = breadcrumbs !== null;
  const showInstructorClassMeta = isClassRoute && role === 'instructor';
  const standaloneTitle = pageTitles[path] ?? 'GrepThink';

  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleCopyCode = () => {
    if (selectedClass?.course_code) {
      navigator.clipboard.writeText(selectedClass.course_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Close dropdowns when clicking outside
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
    navigate('/app/settings');
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
                {notifications.length === 0 ? (
                  <div className="app-header__empty-state">No notifications</div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`app-header__notification-item ${!notification.read ? 'unread' : ''}`}
                    >
                      <div className="app-header__notification-title">{notification.title}</div>
                      <div className="app-header__notification-content">{notification.content}</div>
                      <div className="app-header__notification-time">{notification.time}</div>
                    </div>
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

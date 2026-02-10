import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Search, User, ChevronDown, Settings, LogOut } from 'lucide-react';
import BellIcon from '@assets/mingcute_notification-fill.svg';
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
  '/app/join-class': 'Join Class',
  '/app/dashboard': 'Dashboard',
  '/app/projects': 'Projects',
  '/app/roster': 'Roster',
  '/app/modules': 'Modules',
  '/app/ta-management': 'TA Management',
  '/app/create-project': 'Create Project',
  '/app/browse-projects': 'Browse Projects',
  '/app/my-project': 'My Project',
  '/app/settings': 'Settings',
  '/app/help-center': 'Help Center',
};

const Header: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
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

  // Get page title from current route
  const pageTitle = pageTitles[location.pathname] || 'GrepThink';
  
  // Count unread notifications
  const unreadCount = notifications.filter(n => !n.read).length;

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
    <header className="app-header">
      {/* Left: Page Title */}
      <h1 className="app-header__page-title">{pageTitle}</h1>

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

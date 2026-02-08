import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TbLayoutSidebar, TbMoonFilled } from "react-icons/tb";
import { ChevronDown } from 'lucide-react';
import { Code } from 'lucide-react';
import { instructorSidebarConfig, studentSidebarConfig, type UserRole } from '../config/sidebar';
import logo from '@assets/grepthink l logo.svg?url';
import './Sidebar.scss';

interface SidebarProps {
  role: UserRole;
}

const Sidebar: React.FC<SidebarProps> = ({ role: propRole }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [devRole, setDevRole] = useState<UserRole>(propRole);
  const navigate = useNavigate();
  const location = useLocation();

  // Use dev role for development purposes
  const role = devRole;
  const sidebarConfig = role === 'instructor' ? instructorSidebarConfig : studentSidebarConfig;

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    // TODO: Implement dark mode logic
  };

  const toggleDevRole = () => {
    setDevRole(devRole === 'instructor' ? 'student' : 'instructor');
  };

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      {/* Header with Logo */}
      <div className="sidebar-header">
        {!isCollapsed && (
          <div className="sidebar-logo">
            <img src={logo} alt="GrepThink Logo" />
          </div>
        )}
        <button className="collapse-button" onClick={toggleCollapse}>
          <TbLayoutSidebar size={20} />
        </button>
      </div>

      {/* Class Selector */}
      {!isCollapsed && (
        <div className="class-selector">
          <div className="class-selector-header">
            <span className="class-name">No class selected</span>
            <ChevronDown size={16} />
          </div>
        </div>
      )}

      {/* Navigation Sections */}
      <nav className="sidebar-nav">
        {sidebarConfig.map((section) => (
          <div key={section.title} className="sidebar-section">
            {!isCollapsed && <h3 className="section-title">{section.title}</h3>}
            <ul className="section-items">
              {section.items.map((item) => {
                const isActive = location.pathname === item.path;
                
                return (
                  <li key={item.path}>
                    <button
                      className={`sidebar-item ${isActive ? 'active' : ''}`}
                      onClick={() => handleNavigation(item.path)}
                      title={isCollapsed ? item.label : undefined}
                    >
                      {item.icon ? (
                        React.createElement(item.icon, { size: 18 })
                      ) : item.iconSvg ? (
                        <img src={item.iconSvg} alt={item.label} className="icon-svg" />
                      ) : null}
                      {!isCollapsed && <span>{item.label}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom Controls */}
      <div className="sidebar-footer">
        {/* Dark Mode Toggle */}
        <div className="footer-control">
          {!isCollapsed && (
            <div className="control-label">
              <TbMoonFilled size={20} />
              <span>Dark Mode</span>
            </div>
          )}
          <button
            className={`toggle-switch ${isDarkMode ? 'active' : ''}`}
            onClick={toggleDarkMode}
            title={isCollapsed ? 'Toggle Dark Mode' : undefined}
          >
            {isCollapsed ? (
              <TbMoonFilled size={20} />
            ) : (
              <div className="toggle-slider"></div>
            )}
          </button>
        </div>

        {/* Dev Mode Toggle */}
        <div className="footer-control dev-control">
          {!isCollapsed && (
            <div className="control-label">
              <Code size={20} />
              <span>Dev: {role === 'instructor' ? 'Instructor' : 'Student'}</span>
            </div>
          )}
          <button
            className={`toggle-switch ${role === 'instructor' ? 'active' : ''}`}
            onClick={toggleDevRole}
            title={isCollapsed ? `Dev Mode: ${role}` : undefined}
          >
            {isCollapsed ? (
              <Code size={20} />
            ) : (
              <div className="toggle-slider"></div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;

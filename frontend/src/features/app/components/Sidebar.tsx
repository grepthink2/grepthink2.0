import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { TbLayoutSidebar } from "react-icons/tb";
import { ChevronDown } from 'lucide-react';
import { instructorSidebarConfig, studentSidebarConfig, type UserRole } from '../config/sidebar';
import logo from '@assets/grepthink l logo.svg?url';
import './Sidebar.scss';

interface SidebarProps {
  role: UserRole;
}

const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const sidebarConfig = role === 'instructor' ? instructorSidebarConfig : studentSidebarConfig;

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${role === 'instructor' ? 'instructor' : 'student'}`}>
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
    </div>
  );
};

export default Sidebar;

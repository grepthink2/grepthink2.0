import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Code } from 'lucide-react';
import Sidebar from '@features/app/components/Sidebar';
import type { UserRole } from '@features/app/config/sidebar';
import './AppView.scss';

const AppView: React.FC = () => {
  // TODO: Get role from auth context/token when implemented
  const [devRole, setDevRole] = useState<UserRole>('student');

  const toggleDevRole = () => {
    setDevRole(devRole === 'instructor' ? 'student' : 'instructor');
  };

  return (
    <div className="app-view">
      <Sidebar role={devRole} />
      
      {/* Dev Mode Toggle - Top Right */}
      <div className="dev-mode-toggle">
        <div className="dev-control-label">
          <Code size={18} />
          <span>Dev: {devRole === 'instructor' ? 'Instructor' : 'Student'}</span>
        </div>
        <button
          className={`dev-toggle-switch ${devRole === 'instructor' ? 'active' : ''}`}
          onClick={toggleDevRole}
          title={`Dev Mode: ${devRole}`}
        >
          <div className="dev-toggle-slider"></div>
        </button>
      </div>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

export default AppView;

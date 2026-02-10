import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Code } from 'lucide-react';
import Sidebar from '@features/app/components/Sidebar';
import Header from '@features/app/components/Header';
import CreateClassModal from '@features/app/components/CreateClassModal';
import type { UserRole } from '@features/app/config/sidebar';
import './AppView.scss';

const AppView: React.FC = () => {
  // TODO: Get role from auth context/token when implemented
  const [devRole, setDevRole] = useState<UserRole>('student');
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const location = useLocation();

  const toggleDevRole = () => {
    setDevRole(devRole === 'instructor' ? 'student' : 'instructor');
  };

  const handleOpenCreateClassModal = () => {
    setIsCreateClassModalOpen(true);
  };

  const handleCloseCreateClassModal = () => {
    setIsCreateClassModalOpen(false);
  };

  // Close modal when navigation occurs
  useEffect(() => {
    setIsCreateClassModalOpen(false);
  }, [location.pathname]);

  return (
    <div className="app-view">
      <Sidebar role={devRole} onOpenCreateClass={handleOpenCreateClassModal} />
      
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
        <Header />
        <Outlet />
      </main>

      {/* Create Class Modal */}
      <CreateClassModal 
        isOpen={isCreateClassModalOpen} 
        onClose={handleCloseCreateClassModal} 
      />
    </div>
  );
};

export default AppView;

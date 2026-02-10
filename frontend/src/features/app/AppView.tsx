import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Code } from 'lucide-react';
import Sidebar from '@features/app/components/Sidebar';
import Header from '@features/app/components/Header';
import CreateClassModal from '@features/app/components/CreateClassModal';
import JoinClassModal from '@features/app/components/JoinClassModal';
import { ClassProvider } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { UserRole } from '@features/app/config/sidebar';
import './AppView.scss';

const AppView: React.FC = () => {
  const [userRole, setUserRole] = useState<UserRole>('student');
  const [devRole, setDevRole] = useState<UserRole | null>(null);
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isJoinClassModalOpen, setIsJoinClassModalOpen] = useState(false);
  const [isLoadingRole, setIsLoadingRole] = useState(true);
  const [authFailed, setAuthFailed] = useState(false);
  const location = useLocation();

  // Fetch user role on mount
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const response = await api.loginCheck();
        const role = response.role?.toLowerCase();
        
        if (role === 'teacher') {
          setUserRole('instructor');
        } else {
          setUserRole('student');
        }
      } catch (error) {
        console.error('Failed to fetch user role:', error);
        setUserRole('student');
        setAuthFailed(true);
      } finally {
        setIsLoadingRole(false);
      }
    };

    fetchUserRole();
  }, []);

  const toggleDevRole = () => {
    if (devRole === null) {
      setDevRole(userRole === 'instructor' ? 'student' : 'instructor');
    } else if (devRole === userRole) {
      setDevRole(userRole === 'instructor' ? 'student' : 'instructor');
    } else {
      setDevRole(null);
    }
  };

  const handleOpenCreateClassModal = () => {
    setIsCreateClassModalOpen(true);
  };

  const handleCloseCreateClassModal = () => {
    setIsCreateClassModalOpen(false);
  };

  const handleOpenJoinClassModal = () => {
    setIsJoinClassModalOpen(true);
  };

  const handleCloseJoinClassModal = () => {
    setIsJoinClassModalOpen(false);
  };

  // Close modals when navigation occurs
  useEffect(() => {
    setIsCreateClassModalOpen(false);
    setIsJoinClassModalOpen(false);
  }, [location.pathname]);

  const displayRole = devRole !== null ? devRole : userRole;

  if (isLoadingRole) {
    return (
      <div className="app-view-loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <ClassProvider>
      <div className="app-view">
        <Sidebar 
          role={displayRole} 
          onOpenCreateClass={handleOpenCreateClassModal}
          onOpenJoinClass={handleOpenJoinClassModal}
        />
        
        {/* Dev Mode Toggle - Top Right */}
        <div className="dev-mode-toggle">
          <div className="dev-control-label">
            <Code size={18} />
            <span>
              {authFailed && devRole === null ? 'Auth Failed - ' : ''}
              {devRole !== null ? 'Dev' : 'Role'}: {displayRole === 'instructor' ? 'Instructor' : 'Student'}
            </span>
          </div>
          <button
            className={`dev-toggle-switch ${displayRole === 'instructor' ? 'active' : ''}`}
            onClick={toggleDevRole}
            title={
              authFailed 
                ? 'Auth failed - Using dev mode to toggle role'
                : devRole !== null 
                  ? `Dev Mode: ${displayRole}` 
                  : `Real Role: ${displayRole}`
            }
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

        {/* Join Class Modal */}
        <JoinClassModal 
          isOpen={isJoinClassModalOpen} 
          onClose={handleCloseJoinClassModal} 
        />
      </div>
    </ClassProvider>
  );
};

export default AppView;

import React, { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { AppOutletContext } from '@/features/app/appOutletContext';
import Sidebar from '@features/app/components/Layout/Sidebar';
import Header from '@features/app/components/Layout/Header';
import CreateClassModal from '@/features/app/components/Classes/CreateClassModal';
import JoinClassModal from '@/features/app/components/Classes/JoinClassModal';
import Settings from '@features/app/pages/Settings';
import { ClassProvider } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import { instructorOnlyPaths, studentOnlyPaths } from '@features/app/config/routePermissions';
import './AppView.scss';

const AppView: React.FC = () => {
  const { role, loading: authLoading } = useAuth();
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isJoinClassModalOpen, setIsJoinClassModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const location = useLocation();

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

  if (authLoading) {
    return (
      <div className="app-view-loading">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  // Role-based route guard: redirect if user hit a path for the other role
  const pathname = location.pathname;
  if (instructorOnlyPaths.includes(pathname) && role !== 'instructor') {
    return <Navigate to="/app/home" replace />;
  }
  if (studentOnlyPaths.includes(pathname) && role !== 'student') {
    return <Navigate to="/app/home" replace />;
  }

  return (
    <ClassProvider>
      <div className="app-view">
        <Sidebar 
          role={role} 
          onOpenCreateClass={handleOpenCreateClassModal}
          onOpenJoinClass={handleOpenJoinClassModal}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        <main className="app-main">
          <Header onOpenSettings={() => setIsSettingsOpen(true)} />
          <Outlet
            context={
              { openJoinClassModal: handleOpenJoinClassModal } satisfies AppOutletContext
            }
          />
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

        {/* Settings Modal */}
        <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </div>
    </ClassProvider>
  );
};

export default AppView;

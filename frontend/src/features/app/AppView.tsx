import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isJoinClassModalOpen, setIsJoinClassModalOpen] = useState(false);
  const [isLoadingRole, setIsLoadingRole] = useState(true);
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
      } finally {
        setIsLoadingRole(false);
      }
    };

    fetchUserRole();
  }, []);

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
          role={userRole} 
          onOpenCreateClass={handleOpenCreateClassModal}
          onOpenJoinClass={handleOpenJoinClassModal}
        />

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

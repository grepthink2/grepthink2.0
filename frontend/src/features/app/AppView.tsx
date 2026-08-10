import React, { useState, useEffect, Suspense } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { AppOutletContext } from '@/features/app/appOutletContext';
import Sidebar from '@features/app/components/Layout/Sidebar';
import Header from '@features/app/components/Layout/Header';
import PreviewBanner from '@features/app/components/Layout/PreviewBanner';
import CreateClassModal from '@/features/app/components/Classes/CreateClassModal';
import JoinClassModal from '@/features/app/components/Classes/JoinClassModal';
import Settings from '@features/app/pages/Settings';
import PageFallback from '@features/app/components/PageFallback';
import { ClassProvider } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import { instructorOnlyPaths, studentOnlyPaths } from '@features/app/config/routePermissions';
import { MessageWidget } from '@features/messages/components/MessageWidget';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './AppView.scss';

const AppView: React.FC = () => {
  const { role, isPreviewing, loading: authLoading } = useAuth();
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isJoinClassModalOpen, setIsJoinClassModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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

  // Close modals and the mobile nav drawer when navigation occurs
  useEffect(() => {
    setIsCreateClassModalOpen(false);
    setIsJoinClassModalOpen(false);
    setMobileNavOpen(false);
  }, [location.pathname]);

  if (authLoading) {
    return (
      <div
        className="app-view-loading"
        aria-busy="true"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
      >
        <div className="loading-spinner">
          <Skeleton width={160} height={16} />
        </div>
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
      <div className={`app-view${isPreviewing ? ' app-view--previewing' : ''}`}>
        <PreviewBanner />
        <Sidebar
          role={role}
          onOpenCreateClass={handleOpenCreateClassModal}
          onOpenJoinClass={handleOpenJoinClassModal}
          onOpenSettings={() => setIsSettingsOpen(true)}
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />

        {/* Backdrop behind the mobile nav drawer */}
        {mobileNavOpen && (
          <div
            className="app-nav-backdrop"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}

        <main className="app-main">
          <Header
            onOpenSettings={() => setIsSettingsOpen(true)}
            onToggleNav={() => setMobileNavOpen((open) => !open)}
          />
          {/* Single shared boundary for every lazily-loaded leaf route (see
              App.tsx). Scoped to the Outlet only — Sidebar/Header/modals
              above are siblings, not descendants, so they stay mounted and
              visible while a page chunk loads instead of being replaced by
              the fallback. */}
          <Suspense fallback={<PageFallback />}>
            <Outlet
              context={
                { openJoinClassModal: handleOpenJoinClassModal } satisfies AppOutletContext
              }
            />
          </Suspense>
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

        {/* Floating chat tab — auto-hides on /app/messages* and screens < 768px. */}
        <MessageWidget />
      </div>
    </ClassProvider>
  );
};

export default AppView;

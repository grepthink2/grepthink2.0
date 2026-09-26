import React, { useState, Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { AppOutletContext } from '@/features/app/appOutletContext';
import Sidebar from '@features/app/components/Layout/Sidebar';
import Header from '@features/app/components/Layout/Header';
import PreviewBanner from '@features/app/components/Layout/PreviewBanner';
import ClassRouteGuard from '@features/app/components/Layout/ClassRouteGuard';
import { lazyModal } from '@/lib/lazyModal';
import Settings from '@features/app/pages/Settings';
import PageFallback from '@features/app/components/PageFallback';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { ClassProvider } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import { usePreview } from '@/lib/previewContext';
import { MessageWidget } from '@features/messages/components/MessageWidget';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './AppView.scss';

// Both modals load on first open; the create-class form pulls in the date picker.
const CreateClassModal = lazyModal(
  () => import('@/features/app/components/Classes/CreateClassModal'),
  (p) => p.isOpen,
);
const JoinClassModal = lazyModal(
  () => import('@/features/app/components/Classes/JoinClassModal'),
  (p) => p.isOpen,
);

const AppView: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const { isPreviewing } = usePreview();
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

  // Close modals and the mobile nav drawer when navigation occurs. Adjusted
  // while rendering the new path, so nothing stays open into the next page.
  const [prevPathname, setPrevPathname] = useState(location.pathname);
  if (prevPathname !== location.pathname) {
    setPrevPathname(location.pathname);
    setIsCreateClassModalOpen(false);
    setIsJoinClassModalOpen(false);
    setMobileNavOpen(false);
  }

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

  return (
    // Keyed by account: the next account never sees the last one's classes.
    <ClassProvider key={user?.id ?? 'anon'}>
      <div className={`app-view${isPreviewing ? ' app-view--previewing' : ''}`}>
        <PreviewBanner />
        <Sidebar
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
              the fallback. Class pages open only for the roles they are
              for, by your role in the selected class. */}
          <ErrorBoundary resetKey={location.pathname}>
            <Suspense fallback={<PageFallback />}>
              <ClassRouteGuard>
                <Outlet
                  context={
                    { openJoinClassModal: handleOpenJoinClassModal } satisfies AppOutletContext
                  }
                />
              </ClassRouteGuard>
            </Suspense>
          </ErrorBoundary>
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

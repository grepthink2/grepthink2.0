import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import './App.scss';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
import LandingPage from '@features/landing/LandingPage';
import ContactPage from '@features/landing/ContactPage';
import AppView from '@/features/app/AppView';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import Home from '@features/app/pages/Home';
import Login from '@features/auth/pages/Login';
import AuthCallback from '@features/auth/pages/AuthCallback';
import SignUpOrchestrator from '@features/auth/pages/SignUpOrchestrator';
import RoleSelection from '@features/auth/pages/RoleSelection';
import CompleteProfile from '@features/auth/pages/CompleteProfile';
import ForgetPassword from '@features/auth/pages/ForgotPassword';
import VerifyResetPassword from '@features/auth/pages/VerifyResetPassword';
import ResetPassword from '@features/auth/pages/ResetPassword';
import ClassManagement from '@features/classes/pages/ClassManagement';
import Projects from '@features/app/pages/Projects';
import Roster from '@features/app/pages/Roster';
import Modules from '@features/app/pages/Modules';
import TAManagement from '@features/app/pages/TAManagement';
import TAReview from '@features/app/pages/TAReview';
import TAMeetings from '@features/app/pages/TAMeetings';
import TSRViewPage from '@features/app/pages/TSRViewPage';
import FeedbackViewPage from '@features/app/pages/FeedbackViewPage';
import Dashboard from '@features/app/pages/Dashboard';
import ProjectDetails from '@features/app/pages/ProjectDetails';
import CreateProject from '@features/app/pages/CreateProject';
import Assign from '@features/app/components/Project/Assign/Assign';
import Staffing from '@features/app/components/Project/Assign/Staffing';
import MyClasses from '@features/app/pages/MyClasses';
import Assignments from '@features/app/pages/Assignments';
import AssignmentDetail from '@features/app/pages/AssignmentDetail';
import BrowseProjects from '@features/app/pages/BrowseProjects';
import MyProject from '@features/app/pages/MyProject';
import TestProjects from '@pages/TestProjects';
import Messages from '@features/messages/pages/Messages';
import { ConversationsProvider } from '@features/messages/hooks/useConversations';
import { NotificationsProvider } from '@features/notifications/hooks/useNotifications';
import { PreviewProvider } from '@/lib/previewContext';
function App() {
  return (
    <Router>
      <ScrollToTop />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/studentsignup" element={<SignUpOrchestrator />} />
        <Route path="/instructorsignup" element={<SignUpOrchestrator />} />
        <Route path="/select" element={<RoleSelection />} />
        <Route path="/complete-profile" element={<CompleteProfile />} />
        <Route path="/forgot-password" element={<ForgetPassword />} />
        <Route path="/verify-reset-password" element={<VerifyResetPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* App routes with persistent sidebar (protected: requires auth).
            ConversationsProvider lives here so the unread badge in the
            sidebar (and the tab title) update even when the user isn't
            on /app/messages. */}
        <Route path="/app" element={<ProtectedRoute />}>
          <Route element={
            <PreviewProvider>
              <ConversationsProvider>
                <NotificationsProvider>
                  <AppView />
                </NotificationsProvider>
              </ConversationsProvider>
            </PreviewProvider>
          }>
            <Route index element={<Navigate to="/app/home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="messages" element={<Messages />} />
            <Route path="messages/compose" element={<Messages />} />
            <Route path="messages/:conversationId" element={<Messages />} />
            <Route path="my-classes" element={<MyClasses />} />
            <Route path="class-settings" element={<div>Class settings — Coming soon</div>} />
            <Route path="join-class" element={<div>Join Class - Coming Soon</div>} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:projectId" element={<ProjectDetails />} />
            <Route path="roster" element={<Roster />} />
            <Route path="modules" element={<Modules />} />
            <Route path="modules/tsr/:assignmentId" element={<TSRViewPage />} />
            <Route path="modules/feedback/:assignmentId" element={<FeedbackViewPage />} />
            <Route path="ta-management" element={<TAManagement />} />
            <Route path="ta-meetings" element={<TAMeetings />} />
            <Route path="ta-review" element={<TAReview />} />
            <Route path="ta-review/:assignmentId" element={<TAReview />} />
            <Route path="create-project" element={<CreateProject />} />
            <Route path="assign-projects" element={<Assign />} />
            <Route path="staff-projects" element={<Staffing />} />
            <Route path="browse-projects" element={<BrowseProjects />} />
            <Route path="my-project" element={<MyProject />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="assignments/:assignmentId" element={<AssignmentDetail />} />
            <Route path="settings" element={<Navigate to="/app/home" replace />} />
            <Route path="help-center" element={<div>Help Center - Coming Soon</div>} />
          </Route>
        </Route>

        <Route path="/classes" element={<ClassManagement />} />
        <Route path="/test-projects" element={<Navigate to="/test-115a-projects" replace />} />
        <Route path="/test-115a-projects" element={<TestProjects />} />
        <Route path="/test-115b-projects" element={<TestProjects />} />
      </Routes>
    </Router>
  );
}

export default App;

import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, lazy } from 'react';
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
import AuthConfirm from '@features/auth/pages/AuthConfirm';
import SignUpOrchestrator from '@features/auth/pages/SignUpOrchestrator';
import RoleSelection from '@features/auth/pages/RoleSelection';
import CompleteProfile from '@features/auth/pages/CompleteProfile';
import ForgetPassword from '@features/auth/pages/ForgotPassword';
import VerifyResetPassword from '@features/auth/pages/VerifyResetPassword';
import ResetPassword from '@features/auth/pages/ResetPassword';
import ClassManagement from '@features/classes/pages/ClassManagement';
import Modules from '@features/app/pages/Modules';
import TAManagement from '@features/app/pages/TAManagement';
import { RequireReviewAccess } from '@features/app/components/RequireReviewAccess';
import TAMeetings from '@features/app/pages/TAMeetings';
import Dashboard from '@features/app/pages/Dashboard';
import MyClasses from '@features/app/pages/MyClasses';
import Assignments from '@features/app/pages/Assignments';
import BrowseProjects from '@features/app/pages/BrowseProjects';
import MyProject from '@features/app/pages/MyProject';
import { ConversationsProvider } from '@features/messages/hooks/useConversations';
import { NotificationsProvider } from '@features/notifications/hooks/useNotifications';
import { PreviewProvider } from '@/lib/previewContext';

// Heavy leaf routes — code-split with React.lazy so recharts, the big
// review/roster/assignment forms, and long tables aren't part of the
// initial bundle. They render under the single shared <Suspense> boundary
// in AppView (wrapping its route Outlet), so the shell keeps rendering
// while a chunk loads. Do NOT lazy the RequireReviewAccess guard itself —
// only the two routes it wraps.
const Messages = lazy(() => import('@features/messages/pages/Messages'));
const Projects = lazy(() => import('@features/app/pages/Projects'));
const Roster = lazy(() => import('@features/app/pages/Roster'));
// TAReview shares the same heavy TSRS/TSRView subtree as TSRViewPage below
// (both statically import '@features/app/components/TSRS/TSRView'); lazily
// loading only one of them would leave that subtree in the main chunk via
// the other, so both move together.
const TAReview = lazy(() => import('@features/app/pages/TAReview'));
const FinalReviews = lazy(() => import('@features/app/pages/FinalReviews'));
const FinalReviewDetail = lazy(() => import('@features/app/pages/FinalReviewDetail'));
const TSRViewPage = lazy(() => import('@features/app/pages/TSRViewPage'));
const FeedbackViewPage = lazy(() => import('@features/app/pages/FeedbackViewPage'));
const ProjectDetails = lazy(() => import('@features/app/pages/ProjectDetails'));
const CreateProject = lazy(() => import('@features/app/pages/CreateProject'));
// Assign is Staffing's sibling in the same folder/pattern — same size
// profile, fully isolated component subtree (no other route imports it).
const Assign = lazy(() => import('@features/app/components/Project/Assign/Assign'));
const Staffing = lazy(() => import('@features/app/components/Project/Assign/Staffing'));
// AssignmentDetail pulls in TSRS.tsx (recharts via ContributionsTab),
// InterestForm, and FeedbackForm depending on assignment type — the
// heaviest single leaf in the app after FinalReviewDetail.
const AssignmentDetail = lazy(() => import('@features/app/pages/AssignmentDetail'));
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
        <Route path="/auth/confirm" element={<AuthConfirm />} />
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
            <Route element={<RequireReviewAccess />}>
              <Route path="ta-review/final-reviews" element={<FinalReviews />} />
              <Route path="ta-review/final-reviews/:projectId" element={<FinalReviewDetail />} />
            </Route>
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
      </Routes>
    </Router>
  );
}

export default App;

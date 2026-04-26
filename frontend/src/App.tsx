import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.scss';
import LandingPage from '@pages/LandingPage';
import AppView from '@/features/app/AppView';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import Home from '@features/app/pages/Home';
import Login from '@features/auth/pages/Login';
import AuthCallback from '@features/auth/pages/AuthCallback';
import SignUpOrchestrator from '@features/auth/pages/SignUpOrchestrator';
import RoleSelection from '@features/auth/pages/RoleSelection';
import ForgetPassword from '@features/auth/pages/ForgotPassword';
import VerifyResetPassword from '@features/auth/pages/VerifyResetPassword';
import ResetPassword from '@features/auth/pages/ResetPassword';
import ClassManagement from '@features/classes/pages/ClassManagement';
import Projects from '@features/app/pages/Projects';
import Roster from '@features/app/pages/Roster';
import Modules from '@features/app/pages/Modules';
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

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/studentsignup" element={<SignUpOrchestrator />} />
        <Route path="/instructorsignup" element={<SignUpOrchestrator />} />
        <Route path="/select" element={<RoleSelection />} />
        <Route path="/forgot-password" element={<ForgetPassword />} />
        <Route path="/verify-reset-password" element={<VerifyResetPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* App routes with persistent sidebar (protected: requires auth) */}
        <Route path="/app" element={<ProtectedRoute />}>
          <Route element={<AppView />}>
            <Route index element={<Navigate to="/app/home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="messages" element={<div>Messages - Coming Soon</div>} />
            <Route path="my-classes" element={<MyClasses />} />
            <Route path="class-settings" element={<div>Class settings — Coming soon</div>} />
            <Route path="join-class" element={<div>Join Class - Coming Soon</div>} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:projectId" element={<ProjectDetails />} />
            <Route path="roster" element={<Roster />} />
            <Route path="modules" element={<Modules />} />
            <Route path="ta-management" element={<div>TA Management - Coming Soon</div>} />
            <Route path="create-project" element={<CreateProject />} />
            <Route path="assign-projects" element={<Assign />} />
            <Route path="staff-projects" element={<Staffing />} />
            <Route path="browse-projects" element={<BrowseProjects />} />
            <Route path="my-project" element={<MyProject />} />
            <Route path="assignments" element={<Assignments />} />
            <Route path="assignments/:assignmentId" element={<AssignmentDetail />} />
            <Route path="settings" element={<div>Settings - Coming Soon</div>} />
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

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '@pages/LandingPage';
import AppView from '@features/app/pages/AppView';
import Home from '@features/app/pages/Home';
import Login from '@features/auth/pages/Login';
import SignUpOrchestrator from '@features/auth/pages/SignUpOrchestrator';
import RoleSelection from '@features/auth/pages/RoleSelection';
import ForgetPassword from '@features/auth/pages/ForgotPassword';
import VerifyResetPassword from '@features/auth/pages/VerifyResetPassword';
import ResetPassword from '@features/auth/pages/ResetPassword';

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/studentsignup" element={<SignUpOrchestrator />} />
        <Route path="/instructorsignup" element={<SignUpOrchestrator />} />
        <Route path="/select" element={<RoleSelection />} />
        <Route path="/forgot-password" element={<ForgetPassword />} />
        <Route path="/verify-reset-password" element={<VerifyResetPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* App routes with persistent sidebar */}
        <Route path="/app" element={<AppView />}>
          <Route index element={<Navigate to="/app/home" replace />} />
          <Route path="home" element={<Home />} />
          {/* Add more routes here as you build them */}
          {/* <Route path="messages" element={<Messages />} /> */}
          {/* <Route path="my-classes" element={<MyClasses />} /> */}
          {/* <Route path="dashboard" element={<Dashboard />} /> */}
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

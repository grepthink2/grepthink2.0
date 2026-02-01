import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import LandingPage from '@pages/LandingPage';
import Login from '@features/auth/pages/Login';
import SignUpOrchestrator from '@features/auth/pages/SignUpOrchestrator';
import RoleSelection from '@features/auth/pages/RoleSelection';
import ForgetPassword from '@features/auth/pages/ForgotPassword';
import ClerkDemo from './ClerkDemo';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/clerk" element={<ClerkDemo />} />
        <Route path="/login" element={<Login />} />
        <Route path="/studentsignup" element={<SignUpOrchestrator />} />
        <Route path="/instructorsignup" element={<SignUpOrchestrator />} />
        <Route path="/select" element={<RoleSelection />} />
        <Route path="/forgot-password" element={<ForgetPassword />} />
      </Routes>
      
      {/* Temporary Navigation for testing */}
      <div style={{ position: 'fixed', bottom: 10, right: 10, background: 'white', padding: 10, border: '1px solid #ccc', zIndex: 9999 }}>
        <Link to="/clerk">Go to Clerk Demo</Link>
      </div>
    </Router>
  );
}

export default App;

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import SignUpOrchestrator from './pages/SignUpOrchestrator';
import RoleSelection from './pages/RoleSelection';
import ForgetPassword from './pages/ForgotPassword';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/studentsignup" element={<SignUpOrchestrator />} />
        <Route path="/instructorsignup" element={<SignUpOrchestrator />} />
        <Route path="/select" element={<RoleSelection />} />
        <Route path="/forgot-password" element={<ForgetPassword />} />
      </Routes>
    </Router>
  );
}

export default App;

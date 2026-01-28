import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import StudentSignUp from './pages/StudentSignUp';
import InstructorSignUp from './pages/InstructorSignUp';
import RoleSelection from './pages/RoleSelection';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/studentsignup" element={<StudentSignUp />} />
        <Route path="/instructorsignup" element={<InstructorSignUp />} />
        <Route path="/select" element={<RoleSelection />} />
      </Routes>
    </Router>
  );
}

export default App;

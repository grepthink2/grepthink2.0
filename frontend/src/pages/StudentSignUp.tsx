import React from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentSignUp.scss';

const StudentSignUp: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="student-signup-page">
      <div className="signup-container">
        <h1>Student Sign Up</h1>
        <p>Student sign up page - to be implemented</p>
        <button onClick={() => navigate('/select')}>Back to Role Selection</button>
      </div>
    </div>
  );
};

export default StudentSignUp;

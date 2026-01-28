import React from 'react';
import { useNavigate } from 'react-router-dom';
import './InstructorSignUp.scss';

const InstructorSignUp: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="instructor-signup-page">
      <div className="signup-container">
        <h1>Instructor Sign Up</h1>
        <p>Instructor sign up page - to be implemented</p>
        <button onClick={() => navigate('/select')}>Back to Role Selection</button>
      </div>
    </div>
  );
};

export default InstructorSignUp;

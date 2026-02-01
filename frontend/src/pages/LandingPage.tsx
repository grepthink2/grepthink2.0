import React from 'react';
import { useNavigate } from 'react-router-dom';
import './LandingPage.scss';

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="landing-page">
      <div className="button-container">
        <button 
          className="auth-button signup-button"
          onClick={() => navigate('/select')}
        >
          Sign Up
        </button>
        <button 
          className="auth-button login-button"
          onClick={() => navigate('/login')}
        >
          Login
        </button>
      </div>
    </div>
  );
};

export default LandingPage;

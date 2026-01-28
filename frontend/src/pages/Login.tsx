import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.scss';

const Login: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Login</h1>
        <p>Login page - to be implemented</p>
        <button onClick={() => navigate('/')}>Back to Home</button>
      </div>
    </div>
  );
};

export default Login;

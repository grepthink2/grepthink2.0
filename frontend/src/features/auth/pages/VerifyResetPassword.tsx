/**
 * VerifyResetPassword Page
 * 
 * This page component handles email verification for password reset flow.
 * After the user submits their email in ForgotPassword, they are directed here
 * to verify their email with a 6-digit code before proceeding to reset their password.
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import '@features/auth/components/VerifyEmail.scss';

const VerifyResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const email = location.state?.email || '';

  // Redirect to forgot password if no email is provided
  React.useEffect(() => {
    if (!email) {
      navigate('/forgot-password');
    }
  }, [email, navigate]);

  const handleBack = () => {
    navigate('/forgot-password');
  };

  if (!email) {
    return null; // Will redirect in useEffect
  }

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="pageWrapper">
        <div className="container">
          <div className="verifyEmailContainer">
            <h1 className="header">Check your email</h1>
            <p className="subtext">
              We sent a password reset link to {email}. Open the link to continue.
            </p>
            <div className="verifyForm">
              <button
                type="button"
                className="authButton"
                onClick={() => navigate('/login')}
              >
                Back to Login
              </button>
              <div className="signupSection">
                <span className="signupText">Wrong email?</span>
                <div className="signupLink" onClick={handleBack}>
                  Back to Forgot Password
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default VerifyResetPassword;

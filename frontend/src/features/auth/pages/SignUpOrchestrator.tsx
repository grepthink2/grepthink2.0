/**
 * SignUpOrchestrator Component
 * 
 * This component orchestrates the signup flow by determining the user type
 * (instructor or student) based on the current route and passing it to the
 * SignUp component. It wraps the SignUp component with the gradient background.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import SignUp from '@features/auth/components/SignUp';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import './SignUpOrchestrator.scss';

const SignUpOrchestrator: React.FC = () => {
  const location = useLocation();
  
  // Determine user type based on the current route
  const userType = location.pathname.includes('instructor') 
    ? 'instructor' 
    : location.pathname.includes('student')
    ? 'student'
    : undefined;

  return (
    <>
      <GradientBackgroundWrapper />
      <SignUp userType={userType} />
    </>
  );
};

export default SignUpOrchestrator;

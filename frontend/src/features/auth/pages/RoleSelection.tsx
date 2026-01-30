/**
 * RoleSelection Component
 * 
 * This component serves as the initial signup/authentication page where users can choose
 * their preferred method of creating an account. It provides options for different
 * authentication methods and a link to the login page for existing users.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Presentation, GraduationCap } from 'lucide-react';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import arrowIcon from '@assets/Arrow.svg?url';
import './RoleSelection.scss';

const RoleSelection: React.FC = () => {
  const navigate = useNavigate();

  // Handler for instructor signup navigation
  const handleInstructorSignup = () => {
    navigate('/instructorsignup');
  };

  // Handler for student signup navigation
  const handleStudentSignup = () => {
    navigate('/studentsignup');
  };

  // Handler for login page navigation
  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="pageWrapper">
        <div className="container">
          <h1 className="header">Create an Account</h1>
          <p className="subtext">Just a few details to get started</p>

          {/* Instructor Signup Button */}
          <button 
            className="button-rectangle"
            onClick={handleInstructorSignup}
          >
            <Presentation size={22} strokeWidth={2} />
            Sign Up as Instructor
          </button>

          {/* Student Signup Button */}
          <button 
            className="button-rectangle"
            onClick={handleStudentSignup}
          >
            <GraduationCap size={22} strokeWidth={2} />
            Sign Up as Student
          </button>

          {/* Divider section between auth buttons and login link */}
          <div className="divider">
            <div className="divider-line"></div>
            <div className="divider-text">Or</div>
            <div className="divider-line"></div>
          </div>

          {/* Login section for existing users */}
          <div className="login-section">
            <span className="login-text">Already have an account?</span>
            <div className="login-link" onClick={handleLogin}>
              Login
              <img src={arrowIcon} alt="arrow" className="arrow-icon" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default RoleSelection;

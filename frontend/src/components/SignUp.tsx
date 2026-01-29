/**
 * SignUp Component
 * 
 * This component handles the email-based user registration process.
 * It provides a form for users to enter their email and password,
 * with password visibility toggle functionality and password confirmation.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './SignUp.scss';
import eyeIcon from '../assets/ph_eye.svg?url';
import eyeSlashIcon from '../assets/eye-slash.svg?url';
import googleIcon from '../assets/google.svg?url';
import arrowIcon from '../assets/Arrow.svg?url';

interface SignUpProps {
  userType?: 'instructor' | 'student';
}

const SignUp: React.FC<SignUpProps> = ({ userType }) => {
  const navigate = useNavigate();
  
  // State to toggle password visibility
  const [showPassword, setShowPassword] = React.useState(false);
  
  // State to manage form inputs
  const [formData, setFormData] = React.useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  // State for error handling and loading
  const [error, setError] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(false);

  // Handler for form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear any previous errors when user starts typing
    setError('');
  };

  // Handler for Google sign-up
  const handleGoogleSignUp = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      // TODO: Implement Supabase Google authentication
      console.log('Google sign up clicked for user type:', userType);
      // Placeholder for future Supabase auth implementation
    } catch (error: any) {
      console.error('Google sign up error:', error);
      setError('Google sign up failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    // Basic validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      setIsLoading(false);
      return;
    }

    try {
      // TODO: Implement Supabase email/password signup
      console.log('Signup form submitted:', { 
        email: formData.email, 
        userType 
      });
      // Placeholder for future Supabase auth implementation
    } catch (err) {
      console.error('Signup error:', err);
      setError('Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handler for login page navigation
  const handleLogin = () => {
    navigate('/login');
  };

  // Determine header text based on user type
  const headerText = userType === 'instructor' 
    ? 'Create an Instructor Account' 
    : userType === 'student' 
    ? 'Create a Student Account'
    : 'Create an Account';

  return (
    <div className="pageWrapper">
      <div className="container">
        {/* Header Section */}
        <h1 className="header">{headerText}</h1>
        <p className="subtext">Just a few details to get started</p>

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="signupForm">
          {/* Error Message Display */}
          {error && <div className="error">{error}</div>}

          {/* Email Input Field */}
          <div className="formGroup">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          {/* Password Input Field with Toggle Visibility */}
          <div className="formGroup">
            <label htmlFor="password">Password</label>
            <div className="passwordInputContainer">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <img
                src={showPassword ? eyeSlashIcon : eyeIcon}
                alt="toggle password visibility"
                className="eyeIcon"
                onClick={() => setShowPassword(!showPassword)}
              />
            </div>
          </div>

          {/* Confirm Password Input Field with Toggle Visibility */}
          <div className="formGroup">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="passwordInputContainer">
              <input
                type={showPassword ? "text" : "password"}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
              <img
                src={showPassword ? eyeSlashIcon : eyeIcon}
                alt="toggle password visibility"
                className="eyeIcon"
                onClick={() => setShowPassword(!showPassword)}
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="buttonRectangle"
            disabled={isLoading}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        {/* Alternative Authentication Options */}
        <div className="divider">
          <div className="dividerLine"></div>
          <div className="dividerText">Or</div>
          <div className="dividerLine"></div>
        </div>

        {/* Google Sign-Up Button */}
        <button 
          className="authButton"
          onClick={handleGoogleSignUp}
          disabled={isLoading}
          type="button"
        >
          <img src={googleIcon} alt="Google" className="buttonIcon" />
          Sign Up with Google
        </button>

        {/* Login Section */}
        <div className="loginSection">
          <span className="loginText">Already have an account?</span>
          <div className="loginLink" onClick={handleLogin}>
            Login
            <img src={arrowIcon} alt="arrow" className="arrowIcon" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp; 
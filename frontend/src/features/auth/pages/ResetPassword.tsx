/**
 * ResetPassword Component
 * 
 * This component handles the password reset functionality.
 * It provides a form for users to enter and confirm their new password,
 * with password visibility toggle functionality.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import './ResetPassword.scss';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import eyeIcon from '@assets/ph_eye.svg?url';
import eyeSlashIcon from '@assets/eye-slash.svg?url';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  // State for password visibility toggle
  const [showPassword, setShowPassword] = React.useState(false);
  // State to manage form inputs
  const [formData, setFormData] = React.useState({
    password: '',
    confirmPassword: ''
  });
  // State for error handling and loading
  const [error, setError] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear any previous errors when user starts typing
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // TODO: Implement Supabase password reset
      console.log('Reset password form submitted');
      // Placeholder for future Supabase auth implementation
    } catch (err) {
      console.error('Reset password error:', err);
      setError('Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    navigate('/login');
  };

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="pageWrapper">
        <div className="container">
          {/* Header Section */}
          <h1 className="header">Reset your Password</h1>
          <p className="subtext">Enter and confirm your new password.</p>

          {/* Reset Password Form */}
          <form onSubmit={handleSubmit} className="resetForm">
            {/* Error Message Display */}
            {error && <div className="error">{error}</div>}

            {/* New Password Input Field */}
            <div className="formGroup">
              <label htmlFor="password">New Password</label>
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

            {/* Confirm Password Input Field */}
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
              {isLoading ? 'Resetting Password...' : 'Reset Password'}
            </button>
          </form>

          {/* Return to Login Section */}
          <div className="loginSection">
            <div className="loginLink" onClick={handleLogin}>
              Return to Login
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResetPassword; 
/**
 * ResetPassword Component
 * 
 * This component handles the password reset functionality.
 * It provides a form for users to enter and confirm their new password,
 * with password visibility toggle functionality.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import './ResetPassword.scss';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import eyeIcon from '@assets/ph_eye.svg?url';
import eyeSlashIcon from '@assets/eye-slash.svg?url';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [canReset, setCanReset] = React.useState(false);
  const [checkingSession, setCheckingSession] = React.useState(true);

  React.useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setCanReset(!!data.session);
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setCanReset(!!session);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      if (!canReset) {
        setError('No password reset session found. Please open the reset link from your email.');
        setIsLoading(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: formData.password,
      });

      if (updateError) {
        throw updateError;
      }

      await supabase.auth.signOut();
      navigate('/login');
    } catch (err: unknown) {
      console.error('Reset password error:', err);
      setError(err instanceof Error ? err.message : 'Failed to reset password. Please try again.');
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

          {checkingSession ? (
            <div className="subtext">Checking reset link...</div>
          ) : !canReset ? (
            <div className="error">
              No reset session found. Please open the reset link from your email.
            </div>
          ) : null}

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
                  disabled={isLoading || !canReset || checkingSession}
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
                  disabled={isLoading || !canReset || checkingSession}
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
              disabled={isLoading || !canReset || checkingSession}
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
/**
 * ForgotPassword Component
 * 
 * This component handles the password reset request functionality.
 * It provides a form where users can enter their email address to receive
 * password reset instructions.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import './ForgotPassword.scss';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  
  // State to manage form input and UI states
  const [formData, setFormData] = React.useState({
    email: ''
  });
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string>('');
  const [success, setSuccess] = React.useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear any previous error when user starts typing
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        formData.email,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      if (resetError) {
        throw resetError;
      }

      setSuccess(true);
      navigate('/verify-reset-password', { state: { email: formData.email } });
    } catch (err: unknown) {
      console.error('Password reset error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send password reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="pageWrapper">
        <div className="container">
          {/* Header Section */}
          <h1 className="header">Forgot your Password?</h1>
          <p className="subtext">We'll email instructions to reset your password</p>

          {/* Success Message */}
          {success ? (
            <div className="successMessage">
              <p>Password reset instructions have been sent to your email.</p>
            </div>
          ) : (
            <>
              {/* Password Reset Form */}
              <form onSubmit={handleSubmit} className="forgotPasswordForm">
                {/* Error Message */}
                {error && <div className="error">{error}</div>}

                <div className="formGroup">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    disabled={isLoading}
                  />
                </div>

                <button 
                  type="submit" 
                  className="buttonRectangle"
                  disabled={isLoading}
                >
                  {isLoading ? 'Sending...' : 'Email Password Reset'}
                </button>
              </form>
            </>
          )}

          {/* Return to Login Link */}
          <div className="backToLogin">
            <span className="loginLink" onClick={() => navigate('/login')}>
              Return to Login
            </span>
          </div>
        </div>
      </div>
    </>
  );
};

export default ForgotPassword;

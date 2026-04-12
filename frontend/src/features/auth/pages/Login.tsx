/**
 * Login Component
 * 
 * This component handles user authentication through both email/password
 * and third-party (Google) authentication methods. It provides a form for
 * existing users to log in and navigation options for password recovery
 * and new user registration.
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import './Login.scss';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import eyeIcon from '@assets/ph_eye.svg?url';
import eyeSlashIcon from '@assets/eye-slash.svg?url';
import googleIcon from '@assets/google.svg?url';
import arrowIcon from '@assets/Arrow.svg?url';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  
  // State for password visibility toggle
  const [showPassword, setShowPassword] = React.useState(false);
  // State to manage form inputs
  const [formData, setFormData] = React.useState({
    email: '',
    password: ''
  });
  // State for error handling and loading
  const [error, setError] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(false);
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (error: unknown) {
      console.error('Google sign in error:', error);
      setError('Google sign in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

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
      // signInWithPassword replaces any existing session, so we don't
      // need a pre-emptive signOut() here. (We used to call one to
      // work around a broken cookieStorage adapter — see git log for
      // Phase 1 of the auth refactor.)
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        throw signInError;
      }

      navigate(from, { replace: true });
    } catch (err: unknown) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = () => {
    navigate('/select');
  };

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="pageWrapper">
        <div className="container">
          {/* Header Section */}
          <h1 className="header">Welcome Back</h1>
          <p className="subtext">Login to your account</p>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="loginForm">
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
              <div className="passwordHeader">
                <label htmlFor="password">Password</label>
                <span className="forgotPassword" onClick={() => navigate('/forgot-password')}>
                  Forgot Password?
                </span>
              </div>
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

            <button 
              type="submit" 
              className="buttonRectangle"
              disabled={isLoading}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          {/* Alternative Authentication Options */}
          <div className="divider">
            <div className="dividerLine"></div>
            <div className="dividerText">Or</div>
            <div className="dividerLine"></div>
          </div>

          {/* Google Sign-In Button */}
          <button 
            className="authButton"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            type="button"
          >
            <img src={googleIcon} alt="Google" className="buttonIcon" />
            Sign In with Google
          </button>

          {/* Sign Up Section */}
          <div className="signupSection">
            <span className="signupText">New to Grepthink?</span>
            <div className="signupLink" onClick={handleSignUp}>
              Sign Up
              <img src={arrowIcon} alt="arrow" className="arrowIcon" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;

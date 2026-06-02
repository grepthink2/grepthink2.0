/**
 * SignUp Component
 * 
 * This component handles the email-based user registration process.
 * It provides a form for users to enter their email and password,
 * with password visibility toggle functionality and password confirmation.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/auth';
import './SignUp.scss';
import eyeIcon from '@assets/ph_eye.svg?url';
import eyeSlashIcon from '@assets/eye-slash.svg?url';
import googleIcon from '@assets/google.svg?url';
import arrowIcon from '@assets/Arrow.svg?url';

interface SignUpProps {
  userType?: 'instructor' | 'student';
  embedded?: boolean;
  onAccountCreated?: (email: string) => void;
}

const SignUp: React.FC<SignUpProps> = ({ userType, embedded = false, onAccountCreated }) => {
  const navigate = useNavigate();
  const { getToken } = useAuth();
  
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
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          // AuthCallback exchanges the code and then routes first-time
          // Google users to /select so they can pick student/instructor.
          // See AuthCallback.tsx.
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (oauthError) {
        throw oauthError;
      }
    } catch (error: unknown) {
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

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    // If signing up with a .edu email, check it isn't already claimed as
    // another account's verified edu_email before creating the auth account.
    if (formData.email.toLowerCase().endsWith('.edu')) {
      try {
        const checkRes = await fetch('/api/check-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email }),
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.available) {
            setError('This .edu email is already linked to another account.');
            setIsLoading(false);
            return;
          }
        }
      } catch {
        // Network error on the pre-check — let signup proceed; the backend
        // create-user endpoint has a defensive check as a second layer.
      }
    }

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            role: userType,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (!data.session || !data.user) {
        setError('Email confirmations are enabled. Disable email confirmations in Supabase Auth settings to avoid verification emails.');
        setIsLoading(false);
        return;
      }

      const token = data.session?.access_token || (await getToken());
      if (!token) {
        setError('Failed to retrieve auth token. Please try again.');
        setIsLoading(false);
        return;
      }

      // Sync with Backend
      try {
        const response = await fetch('/api/create-user', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            userId: data.user.id,
            email: formData.email,
            userType: userType
          }),
        });
        
        if (!response.ok) {
          console.error('Failed to sync user to database, but auth succeeded');
        }
      } catch (syncError) {
           console.error('Sync error:', syncError);
      }

      if (onAccountCreated) {
        onAccountCreated(formData.email);
      } else {
        navigate('/app');
      }
    } catch (err: unknown) {
      console.error('Signup error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create account. Please try again.');
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
    <div className={embedded ? 'embeddedWrapper' : 'pageWrapper'}>
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
          <div className="signUpLoginLink" onClick={handleLogin}>
            Login
            <img src={arrowIcon} alt="arrow" className="arrowIcon" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignUp; 
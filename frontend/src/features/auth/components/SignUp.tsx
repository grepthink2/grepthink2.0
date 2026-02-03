/**
 * SignUp Component
 * 
 * This component handles the email-based user registration process.
 * It provides a form for users to enter their email and password,
 * with password visibility toggle functionality and password confirmation.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignUp, useAuth } from '@clerk/clerk-react';
import './SignUp.scss';
import VerifyEmail from './VerifyEmail';
import eyeIcon from '@assets/ph_eye.svg?url';
import eyeSlashIcon from '@assets/eye-slash.svg?url';
import googleIcon from '@assets/google.svg?url';
import arrowIcon from '@assets/Arrow.svg?url';

interface SignUpProps {
  userType?: 'instructor' | 'student';
}

const SignUp: React.FC<SignUpProps> = ({ userType }) => {
  const navigate = useNavigate();
  const { isLoaded, signUp, setActive } = useSignUp();
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
  
  // Verification state
  const [pendingVerification, setPendingVerification] = React.useState(false);
  const [sendingCode, setSendingCode] = React.useState(false);

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
      if (!isLoaded) return;
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/",
      });
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
    if (!isLoaded) return;

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

    try {
      // 1. Create Clerk user
      await signUp.create({
        emailAddress: formData.email,
        password: formData.password,
      });

      // 2. Start email verification
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      
      setPendingVerification(true);
      
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err.errors?.[0]?.message || 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerification = async (code: string) => {
    if (!isLoaded) return;
    setIsLoading(true);
    setError('');

    try {
      // 3. Attempt verification
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code,
      });

      if (completeSignUp.status !== 'complete') {
        console.log(JSON.stringify(completeSignUp, null, 2));
        setError('Verification failed. Please check the code.');
        setIsLoading(false);
        return;
      }
      
      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
        
        // 4. Sync with Backend
        try {
          const token = await getToken();
          const response = await fetch('/api/create-user', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              userId: completeSignUp.createdUserId,
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

        navigate('/home');
      }
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err.errors?.[0]?.message || 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded) return;
    setSendingCode(true);
    setError('');
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    } catch (err: any) {
      setError('Failed to resend code. Please try again.');
    } finally {
      setSendingCode(false);
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

  if (pendingVerification) {
    return (
      <div className="pageWrapper">
        <div className="container">
          <VerifyEmail
            email={formData.email}
            onVerify={handleVerification}
            onResend={handleResendCode}
            onBack={() => {
              setPendingVerification(false);
              setError('');
            }}
            error={error}
            isLoading={isLoading}
            isSending={sendingCode}
            title="Verify your email"
            backText="Wrong email?"
            backLabel="Back to Sign Up"
          />
        </div>
      </div>
    );
  }

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
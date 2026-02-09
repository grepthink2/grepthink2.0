/**
 * Login Component
 * 
 * This component handles user authentication through both email/password
 * and third-party (Google) authentication methods. It provides a form for
 * existing users to log in and navigation options for password recovery
 * and new user registration.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSignIn, useClerk } from '@clerk/clerk-react';
import './Login.scss';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import VerifyEmail from '@features/auth/components/VerifyEmail';
import eyeIcon from '@assets/ph_eye.svg?url';
import eyeSlashIcon from '@assets/eye-slash.svg?url';
import googleIcon from '@assets/google.svg?url';
import arrowIcon from '@assets/Arrow.svg?url';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { isLoaded, signIn, setActive } = useSignIn();
  const { signOut } = useClerk();
  
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
  // State for 2FA (email code) step
  const [needsSecondFactor, setNeedsSecondFactor] = React.useState(false);
  const [emailCodeSent, setEmailCodeSent] = React.useState(false);
  const [sendingCode, setSendingCode] = React.useState(false);

  const sendSecondFactorEmail = React.useCallback(async () => {
    if (!signIn) return;
    const emailFactor = signIn.supportedSecondFactors?.find(
      (f: { strategy: string }) => f.strategy === 'email_code'
    );
    const emailAddressId = (emailFactor as { emailAddressId?: string } | undefined)?.emailAddressId;
    if (!emailAddressId) return;
    setSendingCode(true);
    setError('');
    try {
      await signIn.prepareSecondFactor({
        strategy: 'email_code',
        emailAddressId,
      } as Parameters<typeof signIn.prepareSecondFactor>[0]);
      setEmailCodeSent(true);
    } catch (err) {
      setError('Failed to send verification email. Please try again.');
    } finally {
      setSendingCode(false);
    }
  }, [signIn]);

  // When the 2FA screen is shown, tell Clerk to send the email code
  React.useEffect(() => {
    if (!needsSecondFactor || emailCodeSent) return;
    sendSecondFactorEmail();
  }, [needsSecondFactor, emailCodeSent, sendSecondFactorEmail]);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      if (!isLoaded) return;
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sso-callback",
        redirectUrlComplete: "/home",
      });
    } catch (error: any) {
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
    if (!isLoaded) return;
    setError('');
    setIsLoading(true);

    try {
      // Always sign out first to clear any existing sessions
      // Pass an empty callback to prevent automatic navigation
      await signOut(() => {
        // Do nothing - prevent redirect
      });
      
      // Wait a bit for sign out to fully complete

      // Now sign in with new credentials
      const result = await signIn.create({
        identifier: formData.email,
        password: formData.password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        navigate("/app", { replace: true });
      } else if (result.status === "needs_second_factor") {
        setNeedsSecondFactor(true);
        setError('');
      } else {
        setError("Login unsuccessful. Please check your credentials.");
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.errors?.[0]?.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = () => {
    navigate('/select');
  };

  const handleSecondFactorSubmit = async (code: string) => {
    if (!isLoaded || !signIn) return;
    setError('');
    setIsLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: 'email_code',
        code: code,
      });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate("/app", { replace: true });
      } else {
        setError("Invalid or expired code. Please try again.");
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.message || "Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Show 2FA (email code) step when Clerk requires it
  if (needsSecondFactor) {
    return (
      <>
        <GradientBackgroundWrapper />
        <div className="pageWrapper">
          <div className="container">
            <VerifyEmail
              email={formData.email}
              onVerify={handleSecondFactorSubmit}
              onResend={sendSecondFactorEmail}
              onBack={() => {
                setNeedsSecondFactor(false);
                setEmailCodeSent(false);
                setError('');
              }}
              error={error}
              isLoading={isLoading}
              isSending={sendingCode}
              title="Check your email"
              backText="Wrong credentials?"
              backLabel="Back to Login"
            />
          </div>
        </div>
      </>
    );
  }

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

/**
 * VerifyResetPassword Page
 * 
 * This page component handles email verification for password reset flow.
 * After the user submits their email in ForgotPassword, they are directed here
 * to verify their email with a 6-digit code before proceeding to reset their password.
 */
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSignIn } from '@clerk/clerk-react';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import VerifyEmail from '@features/auth/components/VerifyEmail';

const VerifyResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, isLoaded } = useSignIn();
  
  const email = location.state?.email || '';
  const [error, setError] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  // Redirect to forgot password if no email is provided
  React.useEffect(() => {
    if (!email) {
      navigate('/forgot-password');
    }
  }, [email, navigate]);

  const handleVerify = async (code: string) => {
    if (!isLoaded) return;
    
    setIsLoading(true);
    setError('');

    try {
      // Verify the code and navigate to reset password page
      // We don't actually reset the password here, just verify the code is valid
      // The actual password reset will happen on the ResetPassword page
      navigate('/reset-password', { 
        state: { 
          email: email,
          code: code 
        } 
      });
    } catch (err: any) {
      console.error('Verification error:', err);
      setError(err.errors?.[0]?.message || 'Invalid verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!isLoaded || !signIn) return;
    
    setIsSending(true);
    setError('');

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
    } catch (err: any) {
      console.error('Resend error:', err);
      setError(err.errors?.[0]?.message || 'Failed to resend verification code.');
    } finally {
      setIsSending(false);
    }
  };

  const handleBack = () => {
    navigate('/forgot-password');
  };

  if (!email) {
    return null; // Will redirect in useEffect
  }

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="pageWrapper">
        <div className="container">
          <VerifyEmail
            email={email}
            onVerify={handleVerify}
            onResend={handleResend}
            onBack={handleBack}
            error={error}
            isLoading={isLoading}
            isSending={isSending}
            title="Verify your email"
            backText="Wrong email?"
            backLabel="Back to Forgot Password"
          />
        </div>
      </div>
    </>
  );
};

export default VerifyResetPassword;

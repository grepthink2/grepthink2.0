/**
 * SignUpOrchestrator Component
 *
 * Orchestrates the email/password signup flow: credentials first, then a
 * swipe transition to account details (name + roster .edu email).
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import SignUp from '@features/auth/components/SignUp';
import AccountDetails from '@features/auth/pages/AccountDetails';
import GradientBackgroundWrapper from '@features/auth/components/GradientBackGroundWrapper';
import './SignUpOrchestrator.scss';

const SignUpOrchestrator: React.FC = () => {
  const location = useLocation();
  const [step, setStep] = React.useState<'signup' | 'details'>('signup');
  const [signupEmail, setSignupEmail] = React.useState('');

  const userType = location.pathname.includes('instructor')
    ? 'instructor'
    : location.pathname.includes('student')
      ? 'student'
      : undefined;

  const handleAccountCreated = (email: string) => {
    setSignupEmail(email);
    setStep('details');
  };

  return (
    <>
      <GradientBackgroundWrapper />
      <div className="signupOrchestrator">
        <div
          className={`signupOrchestrator__track${
            step === 'details' ? ' signupOrchestrator__track--details' : ''
          }`}
        >
          <div className="signupOrchestrator__panel">
            <SignUp
              userType={userType}
              embedded
              onAccountCreated={handleAccountCreated}
            />
          </div>
          <div className="signupOrchestrator__panel">
            {step === 'details' && (
              <AccountDetails email={signupEmail} userType={userType} embedded />
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SignUpOrchestrator;

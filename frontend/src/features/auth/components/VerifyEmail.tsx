/**
 * VerifyEmail Component
 * 
 * A reusable email verification component with bubble-style code input.
 * Used by both Login (2FA) and SignUp flows.
 */
import React from 'react';
import './VerifyEmail.scss';
import arrowIcon from '@assets/Arrow.svg?url';

interface VerifyEmailProps {
  email: string;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
  error?: string;
  isLoading?: boolean;
  isSending?: boolean;
  title?: string;
  backText?: string;
  backLabel?: string;
}

const VerifyEmail: React.FC<VerifyEmailProps> = ({
  email,
  onVerify,
  onResend,
  onBack,
  error,
  isLoading = false,
  isSending = false,
  title = 'Verify your email',
  backText = 'Wrong credentials?',
  backLabel = 'Back to Login'
}) => {
  const [code, setCode] = React.useState(['', '', '', '', '', '']);
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const handleCodeChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d$/.test(value)) return;
    
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Move to next input if value is entered
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 6 digits are filled
    if (value && index === 5 && newCode.every(digit => digit !== '')) {
      onVerify(newCode.join(''));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    const digits = pastedData.split('').filter(char => /^\d$/.test(char));
    
    if (digits.length > 0) {
      const newCode = [...code];
      digits.forEach((digit, i) => {
        if (i < 6) newCode[i] = digit;
      });
      setCode(newCode);
      
      // Focus the next empty input or the last one
      const nextEmptyIndex = newCode.findIndex(d => d === '');
      if (nextEmptyIndex !== -1) {
        inputRefs.current[nextEmptyIndex]?.focus();
      } else {
        inputRefs.current[5]?.focus();
        // Auto-submit if all digits are filled
        if (newCode.every(digit => digit !== '')) {
          onVerify(newCode.join(''));
        }
      }
    }
  };

  return (
    <div className="verifyEmailContainer">
      <h1 className="header">{title}</h1>
      <p className="subtext">
        {isSending ? 'Sending verification code...' : `We sent a verification code to ${email}`}
      </p>
      <div className="verifyForm">
        {error && <div className="error">{error}</div>}
        <div className="formGroup">
          <label>Verification code</label>
          <div className="codeInputContainer">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={el => { inputRefs.current[index] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                className="codeInput"
                value={digit}
                onChange={(e) => handleCodeChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                autoComplete="one-time-code"
                disabled={isLoading}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          className="authButton"
          onClick={onResend}
          disabled={isLoading || isSending}
        >
          {isSending ? 'Sending...' : 'Resend code'}
        </button>
        <div className="signupSection">
          <span className="signupText">{backText}</span>
          <div className="signupLink" onClick={onBack}>
            {backLabel}
            <img src={arrowIcon} alt="arrow" className="arrowIcon" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;

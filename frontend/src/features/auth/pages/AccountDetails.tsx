/**
 * AccountDetails — second step of email/password signup.
 *
 * Collects first/last name. Students also provide a roster .edu email when
 * their signup email is not already a .edu address. Whoever holds that address owns
 * the matching roster row, so it is never saved from here: the server emails a code
 * to it and only `verify-edu-email` writes it. A student can skip that and verify
 * later from Settings, so signup never depends on an email arriving.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest, api } from '@/lib/api';
import EduVerifyModal from '@features/app/components/Settings/EduVerifyModal';
import './AccountDetails.scss';

interface AccountDetailsProps {
  email: string;
  userType?: 'instructor' | 'student';
  embedded?: boolean;
}

const AccountDetails: React.FC<AccountDetailsProps> = ({
  email,
  userType,
  embedded = false,
}) => {
  const navigate = useNavigate();
  const isInstructor = userType === 'instructor';
  const primaryIsEdu = email.toLowerCase().endsWith('.edu');
  const needsRosterEmail = !isInstructor;

  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [eduEmail, setEduEmail] = React.useState(primaryIsEdu ? email : '');
  const [error, setError] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [eduVerifyOpen, setEduVerifyOpen] = React.useState(false);
  const [pendingEduEmail, setPendingEduEmail] = React.useState('');
  const [codeWasLogged, setCodeWasLogged] = React.useState(false);
  const mustVerifyRosterEmail = needsRosterEmail && !primaryIsEdu;

  const saveDetails = async ({ verifyRosterEmail }: { verifyRosterEmail: boolean }) => {
    setError('');

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEdu = eduEmail.trim();

    if (!trimmedFirst || !trimmedLast) {
      setError('Please enter your first and last name.');
      return;
    }

    if (verifyRosterEmail) {
      if (!trimmedEdu) {
        setError('Please enter your roster .edu email.');
        return;
      }
      if (!trimmedEdu.toLowerCase().endsWith('.edu')) {
        setError('Roster email must be a valid .edu address.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (verifyRosterEmail) {
        const checkData = await api.checkEmail(trimmedEdu);
        if (checkData && !checkData.available) {
          setError('This .edu email is already linked to another account.');
          setIsLoading(false);
          return;
        }
      }

      await apiRequest('/api/profiles/me', {
        method: 'PATCH',
        body: JSON.stringify({ first_name: trimmedFirst, last_name: trimmedLast }),
      });

      if (!verifyRosterEmail) {
        navigate('/app/home', { replace: true });
        return;
      }

      const sent = await apiRequest<{ delivery?: 'email' | 'log' }>(
        '/api/profiles/send-edu-verification',
        { method: 'POST', body: JSON.stringify({ edu_email: trimmedEdu }) },
      );
      setCodeWasLogged(sent?.delivery === 'log');
      setPendingEduEmail(trimmedEdu);
      setEduVerifyOpen(true);
    } catch (err: unknown) {
      console.error('[AccountDetails] continue failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save your details. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    void saveDetails({ verifyRosterEmail: mustVerifyRosterEmail });
  };

  const handleEduVerified = () => {
    setEduVerifyOpen(false);
    navigate('/app/home', { replace: true });
  };

  return (
    <>
      <div className={embedded ? 'embeddedWrapper' : 'pageWrapper'}>
        <div className="container">
          <h1 className="header">Complete Your Profile</h1>
          <p className="subtext">Just a few more details before you get started</p>

          <form onSubmit={handleContinue} className="detailsForm">
            {error && <div className="error">{error}</div>}

            <div className="nameRow">
              <div className="formGroup">
                <label htmlFor="firstName">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    setError('');
                  }}
                  placeholder="First name"
                  required
                />
              </div>

              <div className="formGroup">
                <label htmlFor="lastName">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    setError('');
                  }}
                  placeholder="Last name"
                  required
                />
              </div>
            </div>

            {needsRosterEmail && (
              <div className="formGroup">
                <label htmlFor="eduEmail">
                  {primaryIsEdu ? '.edu Email' : 'Roster .edu Email'}
                </label>
                <input
                  type="email"
                  id="eduEmail"
                  name="eduEmail"
                  value={eduEmail}
                  onChange={(e) => {
                    setEduEmail(e.target.value);
                    setError('');
                  }}
                  placeholder="you@university.edu"
                  readOnly={primaryIsEdu}
                  className={primaryIsEdu ? 'inputReadonly' : undefined}
                  required={!primaryIsEdu}
                />
              </div>
            )}

            <button
              type="submit"
              className="buttonRectangle"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Continue to Grepthink'}
            </button>

            {mustVerifyRosterEmail && (
              <button
                type="button"
                className="buttonLink"
                disabled={isLoading}
                onClick={() => void saveDetails({ verifyRosterEmail: false })}
              >
                Verify later in Settings
              </button>
            )}
          </form>
        </div>
      </div>

      <EduVerifyModal
        isOpen={eduVerifyOpen}
        eduEmail={pendingEduEmail}
        codeWasLogged={codeWasLogged}
        onVerified={handleEduVerified}
        onClose={() => setEduVerifyOpen(false)}
      />
    </>
  );
};

export default AccountDetails;

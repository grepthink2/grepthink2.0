import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, UserPen, CheckCircle, AlertCircle } from 'lucide-react';
import { LinkedinIcon as Linkedin, GithubIcon as Github } from '@/components/icons/BrandIcons';
import { useAuth } from '@/lib/auth';
import { useClass } from '@/lib/classContext';
import { useInstitutions } from '@/lib/institutions';
import { isSchoolEmail } from '@/lib/schoolEmail';
import { supabase } from '@/lib/supabaseClient';
import { apiRequest, api, type ApiProfile } from '@/lib/api';
import EduVerifyModal from '@features/app/components/Settings/EduVerifyModal';
import './Settings.scss';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  const { user, canCreateClasses } = useAuth();
  const { classes } = useClass();
  const institutions = useInstitutions() ?? [];
  // The roster email and portfolio fields are for accounts that are a student or TA
  // somewhere, even if the account can also create classes elsewhere.
  const enrolledSomewhere = classes.some((c) => c.my_role !== 'instructor');
  const showStudentFields = !canCreateClasses || enrolledSomewhere;
  const primaryIsSchool = isSchoolEmail(user?.email, institutions);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkedIn, setLinkedIn] = useState('');
  const [github, setGithub] = useState('');
  const [eduEmail, setEduEmail] = useState('');
  const originalEduEmailRef = useRef('');

  // A new roster address is only saved by the server once a code sent to it comes back.
  const [verifyingEduEmail, setVerifyingEduEmail] = useState<string | null>(null);
  const [codeWasLogged, setCodeWasLogged] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!user || !isOpen) return;
    apiRequest<ApiProfile>('/api/profiles/me')
      .then((profile) => {
        setFirstName(profile.first_name ?? '');
        setLastName(profile.last_name ?? '');
        setAvatarUrl(profile.image_url ?? null);
        setLinkedIn(profile.linkedin ?? '');
        setGithub(profile.github ?? '');
        setEduEmail(profile.edu_email ?? '');
        originalEduEmailRef.current = profile.edu_email ?? '';
      })
      .catch(() => {
        const meta = (user.user_metadata ?? {}) as Record<string, string>;
        setFirstName(meta.first_name || '');
        setLastName(meta.last_name || '');
        setAvatarUrl(meta.image_url || null);
        setLinkedIn(meta.linkedin || '');
        setGithub(meta.github || '');
        setEduEmail('');
        originalEduEmailRef.current = '';
      })
      .finally(() => setSaveStatus('idle'));
  }, [user, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setPendingFile(null);
    setSaveStatus('idle');
    onClose();
  }, [onClose, avatarPreview]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, handleClose]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setPendingFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const handleRemoveAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setPendingFile(null);
    setAvatarPreview(null);
    setAvatarUrl(null);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');

    try {
      let resolvedAvatarUrl = avatarUrl;

      if (pendingFile) {
        const ext = pendingFile.name.split('.').pop() ?? 'jpg';
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('profile')
          .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('profile').getPublicUrl(path);
        resolvedAvatarUrl = urlData.publicUrl;
        setAvatarUrl(resolvedAvatarUrl);
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(null);
        setPendingFile(null);
      }

      const isStudent = showStudentFields;
      const newEduEmail = isStudent && !primaryIsSchool ? eduEmail.trim() : '';
      const origEduEmail = isStudent && !primaryIsSchool ? originalEduEmailRef.current : '';
      const eduEmailChanged = isStudent && !primaryIsSchool && newEduEmail !== origEduEmail;

      if (eduEmailChanged && newEduEmail) {
        if (!isSchoolEmail(newEduEmail, institutions)) {
          throw new Error('Enter your school email address');
        }
        const checkData = await api.checkEmail(newEduEmail);
        if (checkData && !checkData.available) {
          throw new Error('This school email is already linked to another account.');
        }
      }

      const updateData: Record<string, string | null> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        image_url: resolvedAvatarUrl ?? null,
      };

      if (showStudentFields) {
        updateData.linkedin = linkedIn.trim();
        updateData.github = github.trim();
      }

      // Removing the address needs no proof; setting one does (see below).
      if (eduEmailChanged && !newEduEmail) {
        updateData.edu_email = null;
      }

      await apiRequest('/api/profiles/me', {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      if (eduEmailChanged && newEduEmail) {
        const sent = await apiRequest<{ delivery?: 'email' | 'log' }>(
          '/api/profiles/send-edu-verification',
          { method: 'POST', body: JSON.stringify({ edu_email: newEduEmail }) },
        );
        setCodeWasLogged(sent?.delivery === 'log');
        setVerifyingEduEmail(newEduEmail);
        return;
      }

      if (eduEmailChanged) {
        originalEduEmailRef.current = '';
      }

      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleEduVerified = () => {
    if (verifyingEduEmail) originalEduEmailRef.current = verifyingEduEmail;
    setSaveStatus('success');
  };

  const handleEduVerifyClosed = () => {
    // Closed without a valid code: the saved address is still the old one, so show that.
    if (verifyingEduEmail && originalEduEmailRef.current !== verifyingEduEmail) {
      setEduEmail(originalEduEmailRef.current);
      setSaveStatus('error');
      setErrorMessage('Your university email was not changed because it was not verified.');
    }
    setVerifyingEduEmail(null);
  };

  if (!isOpen) return null;

  const displayAvatar = avatarPreview ?? avatarUrl;

  return createPortal(
    <>
    <div className="settings-modal__overlay" onClick={handleClose}>
      <div
        className="settings-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* X — floats over the top-right corner of the entire modal */}
        <button
          type="button"
          className="settings-modal__close"
          onClick={handleClose}
          aria-label="Close settings"
        >
          <X size={18} />
        </button>

        {/* Left nav */}
        <nav className="settings-modal__nav">
          <h2 className="settings-modal__nav-title">Settings</h2>
          <ul className="settings-modal__nav-list">
            <li>
              <button type="button" className="settings-modal__nav-item settings-modal__nav-item--active">
                <UserPen size={16} />
                Profile
              </button>
            </li>
          </ul>
        </nav>

        {/* Right body */}
        <div className="settings-modal__body">
          <div className="settings-modal__section">
            <h3 className="settings-modal__section-title">Profile</h3>

            {/* Avatar */}
            <div className="settings-modal__avatar-row">
              <div className="settings-modal__avatar">
                {displayAvatar ? (
                  <img src={displayAvatar} alt="Profile avatar" className="settings-modal__avatar-img" />
                ) : (
                  <Camera size={26} className="settings-modal__avatar-icon" />
                )}
              </div>
              <div className="settings-modal__avatar-actions">
                <button
                  type="button"
                  className="settings-modal__avatar-change"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Change Avatar
                </button>
                <button
                  type="button"
                  className="settings-modal__avatar-remove"
                  onClick={handleRemoveAvatar}
                >
                  Remove Avatar
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="settings-modal__file-input"
                onChange={handleFileChange}
              />
            </div>

            {/* Name */}
            <div className="settings-modal__row">
              <div className="settings-modal__field">
                <label className="settings-modal__label" htmlFor="sm-first-name">First Name</label>
                <input
                  id="sm-first-name"
                  type="text"
                  className="settings-modal__input"
                  value={firstName}
                  onChange={(e) => { setFirstName(e.target.value); setSaveStatus('idle'); }}
                  placeholder="First name"
                />
              </div>
              <div className="settings-modal__field">
                <label className="settings-modal__label" htmlFor="sm-last-name">Last Name</label>
                <input
                  id="sm-last-name"
                  type="text"
                  className="settings-modal__input"
                  value={lastName}
                  onChange={(e) => { setLastName(e.target.value); setSaveStatus('idle'); }}
                  placeholder="Last name"
                />
              </div>
            </div>

            {/* Email */}
            <div className="settings-modal__field">
              <label className="settings-modal__label" htmlFor="sm-email">Email Address</label>
              <input
                id="sm-email"
                type="email"
                className="settings-modal__input settings-modal__input--readonly"
                value={user?.email ?? ''}
                readOnly
              />
            </div>

            {/* Roster school email — students and TAs */}
            {showStudentFields && (
              primaryIsSchool ? (
                <div className="settings-modal__field">
                  <label className="settings-modal__label">School email</label>
                  <input
                    type="email"
                    className="settings-modal__input settings-modal__input--readonly"
                    value={user?.email ?? ''}
                    readOnly
                  />
                </div>
              ) : (
                <div className="settings-modal__field">
                  <label className="settings-modal__label" htmlFor="sm-edu-email">
                    School email (roster email)
                  </label>
                  <input
                    id="sm-edu-email"
                    type="email"
                    className="settings-modal__input"
                    value={eduEmail}
                    onChange={(e) => { setEduEmail(e.target.value); setSaveStatus('idle'); }}
                    placeholder="you@university.edu"
                  />
                </div>
              )
            )}

            {/* Portfolio — students only, no subtitle */}
            {showStudentFields && (
              <>
                <div className="settings-modal__field">
                  <label className="settings-modal__label" htmlFor="sm-linkedin">LinkedIn Username</label>
                  <div className="settings-modal__input-group">
                    <span className="settings-modal__prefix">
                      <Linkedin size={13} />
                      linkedin.com/in/
                    </span>
                    <input
                      id="sm-linkedin"
                      type="text"
                      className="settings-modal__input settings-modal__input--grouped"
                      value={linkedIn}
                      onChange={(e) => { setLinkedIn(e.target.value); setSaveStatus('idle'); }}
                      placeholder="your-username"
                    />
                  </div>
                </div>

                <div className="settings-modal__field">
                  <label className="settings-modal__label" htmlFor="sm-github">GitHub Username</label>
                  <div className="settings-modal__input-group">
                    <span className="settings-modal__prefix">
                      <Github size={13} />
                      github.com/
                    </span>
                    <input
                      id="sm-github"
                      type="text"
                      className="settings-modal__input settings-modal__input--grouped"
                      value={github}
                      onChange={(e) => { setGithub(e.target.value); setSaveStatus('idle'); }}
                      placeholder="your-username"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sticky footer */}
          <div className="settings-modal__footer">
            {saveStatus === 'error' && (
              <span className="settings-modal__feedback settings-modal__feedback--error">
                <AlertCircle size={15} />
                {errorMessage}
              </span>
            )}
            {saveStatus === 'success' && (
              <span className="settings-modal__feedback settings-modal__feedback--success">
                <CheckCircle size={15} />
                Changes saved.
              </span>
            )}
            <button
              type="button"
              className="settings-modal__save"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
    <EduVerifyModal
      isOpen={verifyingEduEmail !== null}
      eduEmail={verifyingEduEmail ?? ''}
      codeWasLogged={codeWasLogged}
      onVerified={handleEduVerified}
      onClose={handleEduVerifyClosed}
    />
    </>,
    document.body,
  );
};

export default Settings;

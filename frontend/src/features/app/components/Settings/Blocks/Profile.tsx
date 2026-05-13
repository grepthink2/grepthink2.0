import React, { useState, useEffect, useRef } from 'react';
import { Camera } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabaseClient';
import './Profile.scss';

const Profile: React.FC = () => {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    const meta = (user.user_metadata ?? {}) as Record<string, string>;
    setFirstName(meta.first_name || '');
    setLastName(meta.last_name || '');
    setAvatarUrl(meta.avatar_url || null);
  }, [user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    // Reset the input so the same file can be re-selected if needed
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
          .from('avatars')
          .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        resolvedAvatarUrl = urlData.publicUrl;
        setAvatarUrl(resolvedAvatarUrl);
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(null);
        setPendingFile(null);
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          avatar_url: resolvedAvatarUrl ?? null,
        },
      });

      if (error) throw error;
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const displayAvatar = avatarPreview ?? avatarUrl;

  return (
    <div className="profile-block">
      <h3 className="profile-block__title">Profile Information</h3>

      <div className="profile-block__avatar-row">
        <div className="profile-block__avatar">
          {displayAvatar ? (
            <img src={displayAvatar} alt="Profile avatar" className="profile-block__avatar-img" />
          ) : (
            <Camera size={28} className="profile-block__avatar-icon" />
          )}
        </div>
        <div className="profile-block__avatar-actions">
          <button
            type="button"
            className="profile-block__avatar-change"
            onClick={() => fileInputRef.current?.click()}
          >
            Change
          </button>
          <button
            type="button"
            className="profile-block__avatar-remove"
            onClick={handleRemoveAvatar}
          >
            Remove
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="profile-block__file-input"
          onChange={handleFileChange}
        />
      </div>

      <div className="profile-block__form">
        <div className="profile-block__row">
          <div className="profile-block__field">
            <label className="profile-block__label" htmlFor="profile-first-name">
              First Name
            </label>
            <input
              id="profile-first-name"
              type="text"
              className="profile-block__input"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setSaveStatus('idle'); }}
              placeholder="First name"
            />
          </div>
          <div className="profile-block__field">
            <label className="profile-block__label" htmlFor="profile-last-name">
              Last Name
            </label>
            <input
              id="profile-last-name"
              type="text"
              className="profile-block__input"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setSaveStatus('idle'); }}
              placeholder="Last name"
            />
          </div>
        </div>

        <div className="profile-block__row">
          <div className="profile-block__field profile-block__field--full">
            <label className="profile-block__label" htmlFor="profile-email">
              Email Address
            </label>
            <input
              id="profile-email"
              type="email"
              className="profile-block__input profile-block__input--readonly"
              value={user?.email ?? ''}
              readOnly
            />
          </div>
        </div>
      </div>

      <div className="profile-block__footer">
        {saveStatus === 'error' && (
          <p className="profile-block__feedback profile-block__feedback--error">{errorMessage}</p>
        )}
        {saveStatus === 'success' && (
          <p className="profile-block__feedback profile-block__feedback--success">
            Profile saved successfully.
          </p>
        )}
        <button
          type="button"
          className="profile-block__save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
};

export default Profile;

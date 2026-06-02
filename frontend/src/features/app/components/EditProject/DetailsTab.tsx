import React, { useRef } from 'react';
import { Camera, FolderKanban } from 'lucide-react';

interface DetailsTabProps {
  name: string;
  onNameChange: (value: string) => void;
  nameError: string | null;
  description: string;
  onDescriptionChange: (value: string) => void;
  teamSize: string;
  onTeamSizeChange: (value: string) => void;
  teamSizeError: string | null;
  logoPreview: string | null;
  logoUrl: string | null;
  onLogoFileChange: (file: File | null) => void;
  onRemoveLogo: () => void;
}

const DetailsTab: React.FC<DetailsTabProps> = ({
  name,
  onNameChange,
  nameError,
  description,
  onDescriptionChange,
  teamSize,
  onTeamSizeChange,
  teamSizeError,
  logoPreview,
  logoUrl,
  onLogoFileChange,
  onRemoveLogo,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const displayLogo = logoPreview ?? logoUrl;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      e.target.value = '';
      return;
    }
    onLogoFileChange(file);
    e.target.value = '';
  };

  return (
    <>
      <section className="edit-project__section">
        <h3 className="edit-project__section-title">Project Logo</h3>
        <p className="edit-project__section-hint">
          Shown on Browse Projects when set. Leave empty to use the default icon.
        </p>
        <div className="edit-project__logo-row">
          <div className="edit-project__logo">
            {displayLogo ? (
              <img src={displayLogo} alt="Project logo preview" className="edit-project__logo-img" />
            ) : (
              <FolderKanban size={28} className="edit-project__logo-icon" aria-hidden />
            )}
          </div>
          <div className="edit-project__logo-actions">
            <button
              type="button"
              className="edit-project__logo-change"
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera size={16} aria-hidden />
              {displayLogo ? 'Change logo' : 'Upload logo'}
            </button>
            {displayLogo && (
              <button
                type="button"
                className="edit-project__logo-remove"
                onClick={onRemoveLogo}
              >
                Remove
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="edit-project__logo-input"
              onChange={handleFileChange}
              aria-label="Upload project logo"
            />
          </div>
        </div>
      </section>

      <section className="edit-project__section">
        <h3 className="edit-project__section-title">Project Name</h3>
        <input
          type="text"
          className={`edit-project__input${nameError ? ' edit-project__input--error' : ''}`}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Enter project name"
          aria-label="Project name"
        />
        {nameError && (
          <p className="edit-project__field-error" role="alert">{nameError}</p>
        )}
      </section>

      <section className="edit-project__section">
        <h3 className="edit-project__section-title">Description</h3>
        <textarea
          className="edit-project__textarea"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Describe your project..."
          rows={6}
          aria-label="Project description"
        />
      </section>

      <section className="edit-project__section">
        <h3 className="edit-project__section-title">Max Team Size</h3>
        <p className="edit-project__section-hint">
          Maximum number of members allowed on this project.
        </p>
        <input
          type="number"
          className={`edit-project__input edit-project__input--short${teamSizeError ? ' edit-project__input--error' : ''}`}
          value={teamSize}
          onChange={(e) => onTeamSizeChange(e.target.value)}
          min={1}
          placeholder="e.g. 5"
          aria-label="Max team size"
        />
        {teamSizeError && (
          <p className="edit-project__field-error" role="alert">{teamSizeError}</p>
        )}
      </section>
    </>
  );
};

export default DetailsTab;

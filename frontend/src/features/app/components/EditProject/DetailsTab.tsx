import React from 'react';

interface DetailsTabProps {
  name: string;
  onNameChange: (value: string) => void;
  nameError: string | null;
  description: string;
  onDescriptionChange: (value: string) => void;
  teamSize: string;
  onTeamSizeChange: (value: string) => void;
  teamSizeError: string | null;
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
}) => {
  return (
    <>
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

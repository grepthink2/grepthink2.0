import React from 'react';
import type { MockStudent } from '../interestTypes';
import MultiSelectDropdown from '../MultiSelectDropdown';

interface TeamPreferencesSectionProps {
  taking115c: boolean | null;
  workWith: MockStudent[];
  dontWorkWith: MockStudent[];
  workWithOptions: MockStudent[];
  dontWorkWithOptions: MockStudent[];
  onTaking115cChange: (value: boolean) => void;
  onAddWorkWith: (student: MockStudent) => void;
  onRemoveWorkWith: (studentId: string) => void;
  onAddDontWorkWith: (student: MockStudent) => void;
  onRemoveDontWorkWith: (studentId: string) => void;
}

const TeamPreferencesSection: React.FC<TeamPreferencesSectionProps> = ({
  taking115c,
  workWith,
  dontWorkWith,
  workWithOptions,
  dontWorkWithOptions,
  onTaking115cChange,
  onAddWorkWith,
  onRemoveWorkWith,
  onAddDontWorkWith,
  onRemoveDontWorkWith,
}) => (
  <section className="if-section">
    <header className="if-section__header">
      <h3 className="if-section__title">Team Preferences</h3>
      <p className="if-section__subtitle">
        Help us build teams that work well together. All preferences are kept confidential.
      </p>
    </header>

    <div className="if-section__body">
      <div className="if-field">
        <label className="if-label">
          Are you taking CSE 115C next quarter? <span className="if-required">*</span>
        </label>
        <div className="if-toggle-group">
          <button
            type="button"
            className={`if-toggle${taking115c === true ? ' if-toggle--active' : ''}`}
            aria-pressed={taking115c === true}
            onClick={() => onTaking115cChange(true)}
          >
            Yes
          </button>
          <button
            type="button"
            className={`if-toggle${taking115c === false ? ' if-toggle--active' : ''}`}
            aria-pressed={taking115c === false}
            onClick={() => onTaking115cChange(false)}
          >
            No
          </button>
        </div>
      </div>

      <div className="if-field">
        <label className="if-label">Who would you like to work with? (max 5)</label>
        <MultiSelectDropdown
          placeholder="Search classmates…"
          options={workWithOptions}
          selected={workWith}
          maxItems={5}
          onSelect={onAddWorkWith}
          onRemove={onRemoveWorkWith}
        />
      </div>

      <div className="if-field">
        <label className="if-label">Who would you prefer not to work with?</label>
        <MultiSelectDropdown
          placeholder="Search classmates…"
          options={dontWorkWithOptions}
          selected={dontWorkWith}
          onSelect={onAddDontWorkWith}
          onRemove={onRemoveDontWorkWith}
        />
      </div>
    </div>
  </section>
);

export default TeamPreferencesSection;

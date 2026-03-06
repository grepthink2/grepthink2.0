import React from 'react';
import SkillsSection from './SkillsSection';
import SponsorSection from './SponsorSection';
import { ROLE_OPTIONS } from './constants';

interface TeamSidePanelProps {
  teamSize: string;
  onTeamSizeChange: (value: string) => void;
  teamSizeError: string | null;
  skills: string[];
  skillInput: string;
  onSkillInputChange: (value: string) => void;
  onAddSkill: (skill: string) => void;
  onRemoveSkill: (skill: string) => void;
  showSkillSuggestions: boolean;
  onShowSuggestionsChange: (show: boolean) => void;
  filteredSkills: string[];
  selectedRoles: string[];
  onToggleRole: (roleId: string) => void;
  sponsorName: string;
  onSponsorNameChange: (value: string) => void;
  sponsorCompany: string;
  onSponsorCompanyChange: (value: string) => void;
  sponsorEmail: string;
  onSponsorEmailChange: (value: string) => void;
  sponsorWebsite: string;
  onSponsorWebsiteChange: (value: string) => void;
  sponsorDescription: string;
  onSponsorDescriptionChange: (value: string) => void;
}

const TeamSidePanel: React.FC<TeamSidePanelProps> = ({
  teamSize,
  onTeamSizeChange,
  teamSizeError,
  skills,
  skillInput,
  onSkillInputChange,
  onAddSkill,
  onRemoveSkill,
  showSkillSuggestions,
  onShowSuggestionsChange,
  filteredSkills,
  selectedRoles,
  onToggleRole,
  sponsorName,
  onSponsorNameChange,
  sponsorCompany,
  onSponsorCompanyChange,
  sponsorEmail,
  onSponsorEmailChange,
  sponsorWebsite,
  onSponsorWebsiteChange,
  sponsorDescription,
  onSponsorDescriptionChange,
}) => {
  return (
    <div className="create-project__right-column">
      <div className="create-project__section">
        <h3 className="create-project__section-title">Team Size</h3>
        <input
          type="text"
          className="create-project__input"
          placeholder="How Many People?"
          value={teamSize}
          onChange={(e) => onTeamSizeChange(e.target.value)}
        />
        {teamSizeError && (
          <div className="create-project__field-error" role="alert">
            {teamSizeError}
          </div>
        )}
      </div>

      <SkillsSection
        skills={skills}
        skillInput={skillInput}
        onSkillInputChange={onSkillInputChange}
        onAddSkill={onAddSkill}
        onRemoveSkill={onRemoveSkill}
        showSkillSuggestions={showSkillSuggestions}
        onShowSuggestionsChange={onShowSuggestionsChange}
        filteredSkills={filteredSkills}
      />

      <div className="create-project__section">
        <h3 className="create-project__section-title">Looking for</h3>
        <div className="create-project__roles">
          {ROLE_OPTIONS.map((role) => (
            <button
              key={role.id}
              className={`create-project__role-tag ${
                selectedRoles.includes(role.id) ? 'active' : ''
              }`}
              onClick={() => onToggleRole(role.id)}
            >
              {role.label}
            </button>
          ))}
        </div>
      </div>

      <SponsorSection
        sponsorName={sponsorName}
        onSponsorNameChange={onSponsorNameChange}
        sponsorCompany={sponsorCompany}
        onSponsorCompanyChange={onSponsorCompanyChange}
        sponsorEmail={sponsorEmail}
        onSponsorEmailChange={onSponsorEmailChange}
        sponsorWebsite={sponsorWebsite}
        onSponsorWebsiteChange={onSponsorWebsiteChange}
        sponsorDescription={sponsorDescription}
        onSponsorDescriptionChange={onSponsorDescriptionChange}
      />
    </div>
  );
};

export default TeamSidePanel;

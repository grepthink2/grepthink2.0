import React from 'react';

interface SkillsSectionProps {
  skills: string[];
  skillInput: string;
  onSkillInputChange: (value: string) => void;
  onAddSkill: (skill: string) => void;
  onRemoveSkill: (skill: string) => void;
  showSkillSuggestions: boolean;
  onShowSuggestionsChange: (show: boolean) => void;
  filteredSkills: string[];
}

const SkillsSection: React.FC<SkillsSectionProps> = ({
  skills,
  skillInput,
  onSkillInputChange,
  onAddSkill,
  onRemoveSkill,
  showSkillSuggestions,
  onShowSuggestionsChange,
  filteredSkills,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault();
      onAddSkill(skillInput.trim());
    }
  };

  return (
    <div className="create-project__section">
      <h3 className="create-project__section-title">Skills</h3>
      <div className="create-project__skills-container">
        <div className="create-project__skills-input-wrapper">
          <input
            type="text"
            className="create-project__input"
            placeholder="Add Skill"
            value={skillInput}
            onChange={(e) => {
              onSkillInputChange(e.target.value);
              onShowSuggestionsChange(true);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => onShowSuggestionsChange(true)}
            onBlur={() => setTimeout(() => onShowSuggestionsChange(false), 200)}
          />
          <button
            className="create-project__add-skill-button"
            onClick={() => skillInput.trim() && onAddSkill(skillInput.trim())}
          >
            +
          </button>
        </div>

        {showSkillSuggestions && filteredSkills.length > 0 && (
          <div className="create-project__skill-suggestions">
            {filteredSkills.slice(0, 8).map((skill) => (
              <div
                key={skill}
                className="create-project__skill-suggestion"
                onClick={() => onAddSkill(skill)}
              >
                {skill}
              </div>
            ))}
          </div>
        )}

        <div className="create-project__skills-tags">
          {skills.map((skill) => (
            <span
              key={skill}
              className="create-project__skill-tag"
              onClick={() => onRemoveSkill(skill)}
              title={`Click to remove ${skill}`}
            >
              {skill}
              <span className="create-project__skill-remove">×</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SkillsSection;

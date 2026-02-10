import React, { useState } from 'react';
import './CreateProject.scss';

interface RoleTag {
  id: string;
  label: string;
}

const PRESET_SKILLS = [
  'Python',
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'Express',
  'Django',
  'FastAPI',
  'Figma',
  'Flask',
  'PostgreSQL',
  'MongoDB',
  'MySQL',
  'Redis',
  'Docker',
  'Kubernetes',
  'AWS',
  'Azure',
  'GCP',
  'Git',
  'CI/CD',
  'Machine Learning',
  'Data Science',
  'Design',
  'UI/UX',
  'GraphQL',
  'REST API',
  'TailwindCSS',
  'SASS',
  'Vue.js',
  'Angular',
  'Java',
  'C++',
  'C#',
  'Go',
  'Rust',
  'Swift',
  'Kotlin',
];

const ROLE_OPTIONS: RoleTag[] = [
  { id: 'designer', label: 'Designer' },
  { id: 'frontend', label: 'Frontend Engineer' },
  { id: 'backend', label: 'Backend Engineer' },
  { id: 'database', label: 'Database' },
];

const CreateProject: React.FC = () => {
  const [projectTitle, setProjectTitle] = useState('');
  const [isPreview, setIsPreview] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState<'template' | 'markdown'>('template');
  const [problemStatement, setProblemStatement] = useState('');
  const [projectGoals, setProjectGoals] = useState('');
  const [workingOn, setWorkingOn] = useState('');
  const [techStack, setTechStack] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [showSkillSuggestions, setShowSkillSuggestions] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const filteredSkills = PRESET_SKILLS.filter(
    (skill) =>
      skill.toLowerCase().includes(skillInput.toLowerCase()) &&
      !skills.includes(skill)
  );

  const handleAddSkill = (skill: string) => {
    if (!skills.includes(skill)) {
      setSkills([...skills, skill]);
    }
    setSkillInput('');
    setShowSkillSuggestions(false);
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  };

  const handleSkillInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault();
      handleAddSkill(skillInput.trim());
    }
  };

  const handleCreateProject = () => {
    console.log('Creating project:', {
      projectTitle,
      problemStatement,
      projectGoals,
      workingOn,
      techStack,
      teamSize,
      skills,
      selectedRoles,
    });
  };

  const handleSaveDraft = () => {
    console.log('Saving draft');
  };

  const handleCancel = () => {
    console.log('Cancelling');
  };

  return (
    <div className="create-project">
      {/* Header with Title and Preview Toggle */}
      <div className="create-project__header">
        <div className="create-project__header-left">
          <input
            type="text"
            className="create-project__title-input"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            placeholder="Project Title"
          />
        </div>
        <div className="create-project__preview-toggle">
          <label className="create-project__preview-label">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Preview
          </label>
          <button
            className={`create-project__toggle-button ${isPreview ? 'active' : ''}`}
            onClick={() => setIsPreview(!isPreview)}
            aria-label="Toggle preview"
          >
            <span className="create-project__toggle-slider"></span>
          </button>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="create-project__content">
        {/* Left Column - Project Description */}
        <div className="create-project__left-column">
          <div className="create-project__section create-project__description-section">
            <div className="create-project__section-header">
              <h2>Project Description</h2>
              <div className="create-project__mode-toggle">
                <button
                  className={`create-project__mode-button ${
                    descriptionMode === 'template' ? 'active' : ''
                  }`}
                  onClick={() => setDescriptionMode('template')}
                >
                  Template
                </button>
                <button
                  className={`create-project__mode-button ${
                    descriptionMode === 'markdown' ? 'active' : ''
                  }`}
                  onClick={() => setDescriptionMode('markdown')}
                >
                  Markdown
                </button>
              </div>
            </div>

            {descriptionMode === 'template' ? (
              <div className="create-project__template-fields">
                <div className="create-project__field">
                  <textarea
                    className="create-project__textarea"
                    placeholder="What problem are you solving?"
                    value={problemStatement}
                    onChange={(e) => setProblemStatement(e.target.value)}
                    rows={4}
                  />
                </div>

                <div className="create-project__field-row">
                  <div className="create-project__field">
                    <textarea
                      className="create-project__textarea"
                      placeholder="Project Goals"
                      value={projectGoals}
                      onChange={(e) => setProjectGoals(e.target.value)}
                      rows={4}
                    />
                  </div>
                  <div className="create-project__field">
                    <textarea
                      className="create-project__textarea"
                      placeholder="What you'll be working on"
                      value={workingOn}
                      onChange={(e) => setWorkingOn(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>

                <div className="create-project__field">
                  <textarea
                    className="create-project__textarea"
                    placeholder="Tech Stack (e.g., React, Node.js, PostgreSQL)"
                    value={techStack}
                    onChange={(e) => setTechStack(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <div className="create-project__markdown-editor">
                <textarea
                  className="create-project__textarea create-project__textarea--markdown"
                  placeholder="Enter your project description in Markdown format..."
                  rows={15}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Team Info */}
        <div className="create-project__right-column">
          {/* Team Size */}
          <div className="create-project__section">
            <h3 className="create-project__section-title">Team Size</h3>
            <input
              type="text"
              className="create-project__input"
              placeholder="How Many People?"
              value={teamSize}
              onChange={(e) => setTeamSize(e.target.value)}
            />
          </div>

          {/* Skills */}
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
                    setSkillInput(e.target.value);
                    setShowSkillSuggestions(true);
                  }}
                  onKeyDown={handleSkillInputKeyDown}
                  onFocus={() => setShowSkillSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSkillSuggestions(false), 200)}
                />
                <button
                  className="create-project__add-skill-button"
                  onClick={() => skillInput.trim() && handleAddSkill(skillInput.trim())}
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
                      onClick={() => handleAddSkill(skill)}
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
                    onClick={() => handleRemoveSkill(skill)}
                    title={`Click to remove ${skill}`}
                  >
                    {skill}
                    <span className="create-project__skill-remove">×</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Looking For */}
          <div className="create-project__section">
            <h3 className="create-project__section-title">Looking for</h3>
            <div className="create-project__roles">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role.id}
                  className={`create-project__role-tag ${
                    selectedRoles.includes(role.id) ? 'active' : ''
                  }`}
                  onClick={() => toggleRole(role.id)}
                >
                  {role.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="create-project__footer">
        <button
          className="create-project__button create-project__button--secondary"
          onClick={handleSaveDraft}
        >
          Save as Draft
        </button>
        <div className="create-project__footer-right">
          {/* <button
            className="create-project__button create-project__button--cancel"
            onClick={handleCancel}
          >
            Cancel
          </button> */}
          <button
            className="create-project__button create-project__button--primary"
            onClick={handleCreateProject}
          >
            Create Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProject;

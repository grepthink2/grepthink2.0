import React, { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProjectView from '../components/ProjectView';
import ConfirmModal from '../components/ConfirmModal';
import { useClass, type Class } from '@/lib/classContext';
import { api } from '@/lib/api';
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

/** Generate template-style markdown from the four description fields */
function generateTemplateMarkdown(
  problemStatement: string,
  projectGoals: string,
  workingOn: string,
  techStack: string
): string {
  return `# Project Overview

A concise summary of the problem, goals, scope, and tools behind this project.

### Problem Statement

${problemStatement.trim() || '{{what_are_you_solving}}'}


### Project Goals

${projectGoals.trim() || '{{project_goals}}'}


### Scope of Work

${workingOn.trim() || '{{what_you_are_working_on}}'}


### Tech Stack

${techStack.trim() || '{{tech_stack}}'}


`;
}

/** Extract template fields from markdown that uses our template section headers */
function parseTemplateFromMarkdown(md: string): {
  problemStatement: string;
  projectGoals: string;
  workingOn: string;
  techStack: string;
} {
  const result = {
    problemStatement: '',
    projectGoals: '',
    workingOn: '',
    techStack: '',
  };
  const sectionHeaders = [
    '### Problem Statement',
    '### Project Goals',
    '### Scope of Work',
    '### Tech Stack',
  ] as const;
  const keys: (keyof typeof result)[] = [
    'problemStatement',
    'projectGoals',
    'workingOn',
    'techStack',
  ];
  const remaining = md;
  for (let i = 0; i < sectionHeaders.length; i++) {
    const header = sectionHeaders[i];
    const key = keys[i];
    const startIdx = remaining.indexOf(header);
    if (startIdx === -1) continue;
    const contentStart = startIdx + header.length;
    const nextHeaderIdx =
      i < sectionHeaders.length - 1
        ? remaining.indexOf(sectionHeaders[i + 1], contentStart)
        : -1;
    const contentEnd = nextHeaderIdx === -1 ? remaining.length : nextHeaderIdx;
    let content = remaining.slice(contentStart, contentEnd).trim();
    content = content.replace(/\{\{[^}]+\}\}/g, '').trim();
    result[key] = content;
  }
  return result;
}

const CreateProject: React.FC = () => {
  const navigate = useNavigate();
  const { classes } = useClass();
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
  const [markdownContent, setMarkdownContent] = useState('');
  const [showClearDescriptionModal, setShowClearDescriptionModal] = useState(false);
  const [showSwitchToTemplateWarningModal, setShowSwitchToTemplateWarningModal] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  /** True if the user changed headers or overview text (markdown differs from canonical template). */
  const markdownDiffersFromTemplate = (md: string): boolean => {
    const trimmed = md.trim();
    if (!trimmed) return false;
    const parsed = parseTemplateFromMarkdown(trimmed);
    const canonical = generateTemplateMarkdown(
      parsed.problemStatement,
      parsed.projectGoals,
      parsed.workingOn,
      parsed.techStack
    );
    const normalize = (s: string) =>
      s
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n');
    return normalize(trimmed) !== normalize(canonical);
  };

  const clearDescriptionContent = () => {
    setProblemStatement('');
    setProjectGoals('');
    setWorkingOn('');
    setTechStack('');
    setMarkdownContent('');
  };

  const performSwitchToTemplate = () => {
    if (markdownContent.trim()) {
      const parsed = parseTemplateFromMarkdown(markdownContent);
      setProblemStatement(parsed.problemStatement);
      setProjectGoals(parsed.projectGoals);
      setWorkingOn(parsed.workingOn);
      setTechStack(parsed.techStack);
    }
    setDescriptionMode('template');
  };

  const switchToMarkdown = () => {
    if (descriptionMode === 'template') {
      const hasAnyTemplateContent =
        problemStatement.trim() !== '' ||
        projectGoals.trim() !== '' ||
        workingOn.trim() !== '' ||
        techStack.trim() !== '';
      setMarkdownContent(
        hasAnyTemplateContent
          ? generateTemplateMarkdown(
              problemStatement,
              projectGoals,
              workingOn,
              techStack
            )
          : ''
      );
    }
    setDescriptionMode('markdown');
  };

  const switchToTemplate = () => {
    if (
      descriptionMode === 'markdown' &&
      markdownContent.trim() &&
      markdownDiffersFromTemplate(markdownContent)
    ) {
      setShowSwitchToTemplateWarningModal(true);
      return;
    }
    performSwitchToTemplate();
  };

  const handleCreateProject = async () => {
    // Validation
    if (!selectedClassId) {
      setErrorMessage('Please select a class for your project');
      return;
    }
    if (!projectTitle.trim()) {
      setErrorMessage('Please enter a project title');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // Generate description from template fields or markdown
      const description = descriptionMode === 'template'
        ? generateTemplateMarkdown(problemStatement, projectGoals, workingOn, techStack)
        : markdownContent;

      // Parse team size to get the max number (e.g., "4" from "3/4" or just "4")
      const teamSizeNum = parseInt(teamSize.trim()) || undefined;

      await api.createProject(selectedClassId, {
        title: projectTitle.trim(),
        description,
        team_size: teamSizeNum,
        skills: skills.length > 0 ? skills : undefined,
        looking_for: selectedRoles.length > 0 ? selectedRoles : undefined,
      });

      // Navigate to MyProjects on success
      navigate('/my-projects');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    console.log('Saving draft');
  };

  return (
    <div className="create-project">
      {/* Header with Title and Preview Toggle */}
      <div className="create-project__header">
        <div className="create-project__header-left">
          {isPreview ? (
            <div className="create-project__preview-header">
              <div className="create-project__preview-badge">Live Preview</div>
              <p className="create-project__preview-text">
                You are viewing this project as others will see it
              </p>
            </div>
          ) : (
            <input
              type="text"
              className="create-project__title-input"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              placeholder="Project Title"
            />
          )}
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

      {/* Main Content - Conditional Rendering */}
      {isPreview ? (
        <ProjectView
          projectTitle={projectTitle}
          teamSize={teamSize}
          problemStatement={problemStatement}
          projectGoals={projectGoals}
          workingOn={workingOn}
          techStack={techStack}
          skills={skills}
          selectedRoles={selectedRoles}
          descriptionMode={descriptionMode}
          markdownContent={markdownContent}
        />
      ) : (
        <div className="create-project__content">
        {/* Left Column - Project Description */}
        <div className="create-project__left-column">
          <div className="create-project__section create-project__description-section">
            <div className="create-project__section-header">
              <h2>Project Description</h2>
              <div className="create-project__mode-toggle-wrapper">
                <button
                  className="create-project__refresh-description"
                  onClick={() => setShowClearDescriptionModal(true)}
                  aria-label="Clear project description"
                  title="Clear project description"
                >
                  <RotateCw size={18} />
                </button>
                <div className="create-project__mode-toggle">
                  <button
                    className={`create-project__mode-button ${
                      descriptionMode === 'template' ? 'active' : ''
                    }`}
                    onClick={switchToTemplate}
                  >
                    Template
                  </button>
                  <button
                    className={`create-project__mode-button ${
                      descriptionMode === 'markdown' ? 'active' : ''
                    }`}
                    onClick={switchToMarkdown}
                  >
                    Markdown
                  </button>
                </div>
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
                  value={markdownContent}
                  onChange={(e) => setMarkdownContent(e.target.value)}
                  rows={15}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Team Info */}
        <div className="create-project__right-column">
          {/* Class Selection */}
          <div className="create-project__section">
            <h3 className="create-project__section-title">Class</h3>
            {classes.length === 0 ? (
              <p className="create-project__no-classes">
                You need to join a class first. Go to{' '}
                <button
                  className="create-project__link-button"
                  onClick={() => navigate('/my-classes')}
                >
                  My Classes
                </button>
                {' '}to join a class.
              </p>
            ) : (
              <select
                className="create-project__input"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
              >
                <option value="">Select a class...</option>
                {classes.map((cls: Class) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.course_code ? `${cls.course_code}: ` : ''}{cls.name}
                  </option>
                ))}
              </select>
            )}
          </div>

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
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="create-project__error-message">
          {errorMessage}
          <button
            className="create-project__error-close"
            onClick={() => setErrorMessage('')}
            aria-label="Close error message"
          >
            ×
          </button>
        </div>
      )}

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
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>

      {/* Clear description confirm modal */}
      <ConfirmModal
        isOpen={showClearDescriptionModal}
        onClose={() => setShowClearDescriptionModal(false)}
        onConfirm={() => {
          clearDescriptionContent();
          setShowClearDescriptionModal(false);
        }}
        title="Clear project description?"
        message="This will clear all content in the project description. This cannot be undone."
        confirmText="Clear"
        cancelText="Cancel"
      />

      {/* Switch to template warning (markdown has custom formatting) */}
      <ConfirmModal
        isOpen={showSwitchToTemplateWarningModal}
        onClose={() => setShowSwitchToTemplateWarningModal(false)}
        onConfirm={() => setShowSwitchToTemplateWarningModal(false)}
        onCancel={() => {
          performSwitchToTemplate();
          setShowSwitchToTemplateWarningModal(false);
        }}
        title="Switch to Template?"
        message="The current markdown uses custom formatting (headings or the overview text). Switching back to Template will map only the standard sections (Problem Statement, Project Goals, Scope of Work, Tech Stack) and will reset and drop other content."
        confirmText="Stay"
        cancelText="Continue"
      />
    </div>
  );
};

export default CreateProject;

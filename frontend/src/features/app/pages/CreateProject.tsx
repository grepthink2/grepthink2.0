import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProjectView from '../components/Project/ProjectView';
import ConfirmModal from '../components/Overlays/ConfirmModal';
import ProjectHeader from '../components/CreateProject/ProjectHeader';
import DescriptionEditor from '../components/CreateProject/DescriptionEditor';
import TeamSidePanel from '../components/CreateProject/TeamSidePanel';
import ProjectFooter from '../components/CreateProject/ProjectFooter';
import { PRESET_SKILLS } from '../components/CreateProject/constants';
import { generateTemplateMarkdown, parseTemplateFromMarkdown } from '../utils/projectDescriptionTemplate';
import { api } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import './CreateProject.scss';

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
  const [markdownContent, setMarkdownContent] = useState('');
  const [showClearDescriptionModal, setShowClearDescriptionModal] = useState(false);
  const [showSwitchToTemplateWarningModal, setShowSwitchToTemplateWarningModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [classError, setClassError] = useState<string | null>(null);
  const [teamSizeError, setTeamSizeError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [sponsorName, setSponsorName] = useState('');
  const [sponsorCompany, setSponsorCompany] = useState('');
  const [sponsorEmail, setSponsorEmail] = useState('');
  const [sponsorWebsite, setSponsorWebsite] = useState('');
  const [sponsorDescription, setSponsorDescription] = useState('');

  const navigate = useNavigate();
  const { selectedClass } = useClass();

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
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
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
          ? generateTemplateMarkdown(problemStatement, projectGoals, workingOn, techStack)
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
    setTitleError(null);
    setClassError(null);
    setTeamSizeError(null);
    setApiError(null);

    const name = projectTitle.trim();
    if (!name) {
      setTitleError('Project title is required');
      return;
    }
    if (!selectedClass) {
      setClassError('Please select a class in the sidebar');
      return;
    }

    const teamSizeNum = parseInt(teamSize.trim(), 10);
    if (!Number.isFinite(teamSizeNum) || teamSizeNum < 1) {
      setTeamSizeError('Team size must be a number greater than 0');
      return;
    }

    const description =
      descriptionMode === 'markdown'
        ? markdownContent.trim()
        : generateTemplateMarkdown(problemStatement, projectGoals, workingOn, techStack).trim();

    setSubmitting(true);
    try {
      await api.createProject({
        class_id: selectedClass.id,
        name,
        description: description || undefined,
        team_size: teamSizeNum,
        looking_for_roles: selectedRoles.length > 0 ? selectedRoles : undefined,
        skills: skills.length > 0 ? skills : undefined,
        sponsor_name: sponsorName.trim() || undefined,
        sponsor_company: sponsorCompany.trim() || undefined,
        sponsor_email: sponsorEmail.trim() || undefined,
        sponsor_website: sponsorWebsite.trim() || undefined,
        sponsor_description: sponsorDescription.trim() || undefined,
      });
      navigate('/app/my-classes', { replace: true });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    console.log('Saving draft');
  };

  return (
    <div className="create-project">
      {classError && (
        <div className="create-project__banner-error" role="alert">
          {classError}
        </div>
      )}
      {apiError && (
        <div className="create-project__banner-error" role="alert">
          {apiError}
        </div>
      )}

      <ProjectHeader
        projectTitle={projectTitle}
        onTitleChange={setProjectTitle}
        titleError={titleError}
        isPreview={isPreview}
        onTogglePreview={() => setIsPreview(!isPreview)}
      />

      {isPreview ? (
        <ProjectView
          projectTitle={projectTitle}
          teamSize={teamSize}
          descriptionMarkdown={
            descriptionMode === 'markdown'
              ? markdownContent
              : generateTemplateMarkdown(problemStatement, projectGoals, workingOn, techStack)
          }
          skills={skills}
          selectedRoles={selectedRoles}
          sponsorName={sponsorName}
          sponsorCompany={sponsorCompany}
          sponsorEmail={sponsorEmail}
          sponsorWebsite={sponsorWebsite}
          sponsorDescription={sponsorDescription}
        />
      ) : (
        <div className="create-project__content">
          <DescriptionEditor
            descriptionMode={descriptionMode}
            onSwitchToTemplate={switchToTemplate}
            onSwitchToMarkdown={switchToMarkdown}
            onClearRequest={() => setShowClearDescriptionModal(true)}
            problemStatement={problemStatement}
            onProblemStatementChange={setProblemStatement}
            projectGoals={projectGoals}
            onProjectGoalsChange={setProjectGoals}
            workingOn={workingOn}
            onWorkingOnChange={setWorkingOn}
            techStack={techStack}
            onTechStackChange={setTechStack}
            markdownContent={markdownContent}
            onMarkdownContentChange={setMarkdownContent}
          />

          <TeamSidePanel
            teamSize={teamSize}
            onTeamSizeChange={setTeamSize}
            teamSizeError={teamSizeError}
            skills={skills}
            skillInput={skillInput}
            onSkillInputChange={setSkillInput}
            onAddSkill={handleAddSkill}
            onRemoveSkill={handleRemoveSkill}
            showSkillSuggestions={showSkillSuggestions}
            onShowSuggestionsChange={setShowSkillSuggestions}
            filteredSkills={filteredSkills}
            selectedRoles={selectedRoles}
            onToggleRole={toggleRole}
            sponsorName={sponsorName}
            onSponsorNameChange={setSponsorName}
            sponsorCompany={sponsorCompany}
            onSponsorCompanyChange={setSponsorCompany}
            sponsorEmail={sponsorEmail}
            onSponsorEmailChange={setSponsorEmail}
            sponsorWebsite={sponsorWebsite}
            onSponsorWebsiteChange={setSponsorWebsite}
            sponsorDescription={sponsorDescription}
            onSponsorDescriptionChange={setSponsorDescription}
          />
        </div>
      )}

      <ProjectFooter
        submitting={submitting}
        isDisabled={submitting || !selectedClass}
        onSaveDraft={handleSaveDraft}
        onCreateProject={handleCreateProject}
      />

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

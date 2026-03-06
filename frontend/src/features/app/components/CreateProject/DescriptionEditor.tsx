import React from 'react';
import { RotateCw } from 'lucide-react';

interface DescriptionEditorProps {
  descriptionMode: 'template' | 'markdown';
  onSwitchToTemplate: () => void;
  onSwitchToMarkdown: () => void;
  onClearRequest: () => void;
  problemStatement: string;
  onProblemStatementChange: (value: string) => void;
  projectGoals: string;
  onProjectGoalsChange: (value: string) => void;
  workingOn: string;
  onWorkingOnChange: (value: string) => void;
  techStack: string;
  onTechStackChange: (value: string) => void;
  markdownContent: string;
  onMarkdownContentChange: (value: string) => void;
}

const DescriptionEditor: React.FC<DescriptionEditorProps> = ({
  descriptionMode,
  onSwitchToTemplate,
  onSwitchToMarkdown,
  onClearRequest,
  problemStatement,
  onProblemStatementChange,
  projectGoals,
  onProjectGoalsChange,
  workingOn,
  onWorkingOnChange,
  techStack,
  onTechStackChange,
  markdownContent,
  onMarkdownContentChange,
}) => {
  return (
    <div className="create-project__left-column">
      <div className="create-project__section create-project__description-section">
        <div className="create-project__section-header">
          <h2>Project Description</h2>
          <div className="create-project__mode-toggle-wrapper">
            <button
              className="create-project__refresh-description"
              onClick={onClearRequest}
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
                onClick={onSwitchToTemplate}
              >
                Template
              </button>
              <button
                className={`create-project__mode-button ${
                  descriptionMode === 'markdown' ? 'active' : ''
                }`}
                onClick={onSwitchToMarkdown}
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
                onChange={(e) => onProblemStatementChange(e.target.value)}
                rows={4}
              />
            </div>

            <div className="create-project__field-row">
              <div className="create-project__field">
                <textarea
                  className="create-project__textarea"
                  placeholder="Project Goals"
                  value={projectGoals}
                  onChange={(e) => onProjectGoalsChange(e.target.value)}
                  rows={4}
                />
              </div>
              <div className="create-project__field">
                <textarea
                  className="create-project__textarea"
                  placeholder="What you'll be working on"
                  value={workingOn}
                  onChange={(e) => onWorkingOnChange(e.target.value)}
                  rows={4}
                />
              </div>
            </div>

            <div className="create-project__field">
              <textarea
                className="create-project__textarea"
                placeholder="Tech Stack (e.g., React, Node.js, PostgreSQL)"
                value={techStack}
                onChange={(e) => onTechStackChange(e.target.value)}
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
              onChange={(e) => onMarkdownContentChange(e.target.value)}
              rows={15}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default DescriptionEditor;

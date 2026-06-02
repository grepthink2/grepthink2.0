import React from 'react';
import { ExternalLink } from 'lucide-react';

interface PreviousProjectSectionProps {
  projectName: string;
  projectLink: string;
  onProjectNameChange: (value: string) => void;
  onProjectLinkChange: (value: string) => void;
}

const PreviousProjectSection: React.FC<PreviousProjectSectionProps> = ({
  projectName,
  projectLink,
  onProjectNameChange,
  onProjectLinkChange,
}) => (
  <section className="if-section">
    <header className="if-section__header">
      <h3 className="if-section__title">
        Previous Project <span className="if-required">*</span>
      </h3>
      <p className="if-section__subtitle">
        Share a project you've worked on before so the instructor can gauge your experience.
      </p>
    </header>

    <div className="if-section__body if-grid-2">
      <div className="if-field">
        <label className="if-label">Project Name</label>
        <input
          type="text"
          className="if-input"
          placeholder="e.g., Shopping Cart App"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
        />
      </div>

      <div className="if-field">
        <label className="if-label">
          Project Link <span className="if-label--optional">(optional)</span>
        </label>
        <div className="if-input-icon-wrap">
          <ExternalLink size={14} className="if-input-icon" />
          <input
            type="url"
            className="if-input if-input--with-icon"
            placeholder="https://github.com/you/project"
            value={projectLink}
            onChange={(e) => onProjectLinkChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  </section>
);

export default PreviousProjectSection;

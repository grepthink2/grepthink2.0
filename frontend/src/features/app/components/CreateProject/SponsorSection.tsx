import React from 'react';

interface SponsorSectionProps {
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

const SponsorSection: React.FC<SponsorSectionProps> = ({
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
    <div className="create-project__section">
      <h3 className="create-project__section-title">Sponsor Information</h3>
      <div className="create-project__sponsor-fields">
        <input
          type="text"
          className="create-project__input"
          placeholder="Sponsor Contact Name"
          value={sponsorName}
          onChange={(e) => onSponsorNameChange(e.target.value)}
        />
        <input
          type="text"
          className="create-project__input"
          placeholder="Company / Organization"
          value={sponsorCompany}
          onChange={(e) => onSponsorCompanyChange(e.target.value)}
        />
        <input
          type="email"
          className="create-project__input"
          placeholder="Sponsor Email"
          value={sponsorEmail}
          onChange={(e) => onSponsorEmailChange(e.target.value)}
        />
        <input
          type="url"
          className="create-project__input"
          placeholder="Sponsor Website (https://...)"
          value={sponsorWebsite}
          onChange={(e) => onSponsorWebsiteChange(e.target.value)}
        />
        <textarea
          className="create-project__textarea"
          placeholder="Brief description of the sponsor and their involvement…"
          value={sponsorDescription}
          onChange={(e) => onSponsorDescriptionChange(e.target.value)}
          rows={3}
        />
      </div>
    </div>
  );
};

export default SponsorSection;

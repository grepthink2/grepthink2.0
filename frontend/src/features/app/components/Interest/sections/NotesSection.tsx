import React from 'react';

interface NotesSectionProps {
  value: string;
  onChange: (value: string) => void;
}

const NotesSection: React.FC<NotesSectionProps> = ({ value, onChange }) => (
  <section className="if-section">
    <header className="if-section__header">
      <h3 className="if-section__title">Additional Notes</h3>
      <p className="if-section__subtitle">
        Anything else you'd like the instructor to know.
      </p>
    </header>

    <div className="if-section__body">
      <textarea
        className="if-textarea if-textarea--tall"
        rows={5}
        placeholder="Feel free to share what you're excited to learn, skills you'd like to apply or develop, technologies you're comfortable with, time constraints, or anything else that might help with team placement…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  </section>
);

export default NotesSection;

import React from 'react';
import { ExternalLink, Star } from 'lucide-react';
import type { Student } from './assignTypes';
import './StudentDetails.scss';

interface StudentDetailsProps {
  student: Student;
}

const StudentDetails: React.FC<StudentDetailsProps> = ({ student }) => {
  return (
    <div className="student-details">
      {student.notes && (
        <section className="student-details__section">
          <h4 className="student-details__label">Notes & Comments</h4>
          <div className="student-details__note-box">{student.notes}</div>
        </section>
      )}

      {student.previousProjectName && (
        <section className="student-details__section">
          <h4 className="student-details__label">Previous Project</h4>
          <a className="student-details__link" href="#" onClick={(e) => e.preventDefault()}>
            {student.previousProjectName}
            <ExternalLink size={14} />
          </a>
        </section>
      )}

      <section className="student-details__section">
        <h4 className="student-details__label">Taking CSE 115C</h4>
        <span
          className={`student-details__pill${
            student.takingCS115C
              ? ' student-details__pill--yes'
              : ' student-details__pill--no'
          }`}
        >
          {student.takingCS115C ? 'Yes' : 'No'}
        </span>
      </section>

      {student.preferences.length > 0 && (
        <section className="student-details__section">
          <h4 className="student-details__label">Project Preferences</h4>
          <div className="student-details__prefs">
            {student.preferences.map((pref) => (
              <div key={pref.projectId} className="pref-card">
                <div className="pref-card__header">
                  <span className="pref-card__name">{pref.projectName}</span>
                  <span className="pref-card__rating">
                    <Star size={14} className="pref-card__star" />
                    {pref.rating}/5
                  </span>
                </div>
                <p className="pref-card__reason">{pref.reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default StudentDetails;

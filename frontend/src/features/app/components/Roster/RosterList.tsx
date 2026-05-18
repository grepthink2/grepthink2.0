import React from 'react';
import { UserMinus, Mail } from 'lucide-react';
import type { UiStudent, ClassStatus, GrepthinkStatus } from './rosterTypes';
import './RosterList.scss';

interface RosterListProps {
  students: UiStudent[];
  loading: boolean;
  error: string | null;
  showActions?: boolean;
}

const CLASS_STATUS_LABELS: Record<ClassStatus, string> = {
  enrolled: 'Enrolled',
  waitlisted: 'Waitlisted',
  dropped: 'Dropped',
  not_on_roster: 'Not on Roster',
};

const GREPTHINK_STATUS_LABELS: Record<GrepthinkStatus, string> = {
  registered: 'Registered',
  not_registered: 'Not Registered',
};

const RosterList: React.FC<RosterListProps> = ({
  students,
  loading,
  error,
  showActions = false,
}) => {
  const handleRemove = (student: UiStudent) => {
    // TODO: wire to DELETE /api/classes/{id}/members/{user_id}
    console.warn('Remove student (not yet implemented):', student.id);
  };

  const handleInvite = (student: UiStudent) => {
    // TODO: wire to POST /api/classes/{id}/invite
    console.warn('Invite student (not yet implemented):', student.email);
  };

  if (loading) {
    return (
      <div className="roster-list">
        <div className="roster-list__header">
          <h2 className="roster-list__title">Student Count</h2>
        </div>
        <div className="roster-list__table-card">
          <div className="roster-list__table-wrapper">
            <div className="roster-list__empty-state">Loading students...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="roster-list">
        <div className="roster-list__header">
          <h2 className="roster-list__title">Student Count</h2>
        </div>
        <div className="roster-list__table-card">
          <div className="roster-list__table-wrapper">
            <div className="roster-list__empty-state">Error: {error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="roster-list">
      <div className="roster-list__header">
        <h2 className="roster-list__title">Student Count</h2>
        <span className="roster-list__count-badge">{students.length}</span>
      </div>

      <div className="roster-list__table-card">
        <div className="roster-list__table-wrapper">
          {students.length === 0 ? (
            <div className="roster-list__empty-state">
              No students match the current filter.
            </div>
          ) : (
            <table className="roster-list__table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Class Status</th>
                  <th>GrepThink Status</th>
                  <th>Projects</th>
                  {showActions && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="roster-list__td-name">{student.name}</td>
                    <td className="roster-list__td-email">
                      <a
                        href={`mailto:${student.email}`}
                        className="roster-list__email-link"
                      >
                        {student.email}
                      </a>
                    </td>
                    <td>
                      <span
                        className={`roster-list__badge roster-list__badge--class-${student.classStatus}`}
                      >
                        {CLASS_STATUS_LABELS[student.classStatus]}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`roster-list__badge roster-list__badge--gt-${student.grepthinkStatus}`}
                      >
                        {GREPTHINK_STATUS_LABELS[student.grepthinkStatus]}
                      </span>
                    </td>
                    <td>
                      <div className="roster-list__projects-wrap">
                        {student.projects.length === 0 ? (
                          <span className="roster-list__no-projects">—</span>
                        ) : (
                          student.projects.map((p) => (
                            <span key={p} className="roster-list__project-tag">
                              {p}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    {showActions && (
                      <td className="roster-list__td-actions">
                        {student.grepthinkStatus === 'registered' ? (
                          <button
                            className="roster-list__action-btn roster-list__action-btn--remove"
                            onClick={() => handleRemove(student)}
                          >
                            <UserMinus size={13} />
                            Remove
                          </button>
                        ) : (
                          <button
                            className="roster-list__action-btn roster-list__action-btn--invite"
                            onClick={() => handleInvite(student)}
                          >
                            <Mail size={13} />
                            Invite
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default RosterList;

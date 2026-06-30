import React from 'react';
import { UserMinus, Mail, Loader2 } from 'lucide-react';
import type { UiStudent, ClassStatus, GrepthinkStatus } from './rosterTypes';
import { countableStudents } from './rosterTypes';
import { TableSkeleton } from '@/components/Skeleton/TableSkeleton';
import StatTooltip from '@features/app/components/Project/Assign/StatTooltip';
import SortableHeader from '@features/app/components/shared/SortableHeader';
import { useTableSort, type SortAccessors } from '@features/app/utils/useTableSort';
import './RosterList.scss';

interface RosterListProps {
  students: UiStudent[];
  loading: boolean;
  error: string | null;
  showActions?: boolean;
  onInvite?: (student: UiStudent) => void;
  onRemove?: (student: UiStudent) => void;
  invitingEmails?: Set<string>;
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

type RosterSortKey = 'name' | 'email' | 'classStatus' | 'grepthinkStatus' | 'projects';

const SORT_ACCESSORS: SortAccessors<UiStudent, RosterSortKey> = {
  name: (s) => s.name,
  email: (s) => s.email,
  classStatus: (s) => CLASS_STATUS_LABELS[s.classStatus],
  grepthinkStatus: (s) => GREPTHINK_STATUS_LABELS[s.grepthinkStatus],
  projects: (s) => s.projects.join(', '),
};

const RosterList: React.FC<RosterListProps> = ({
  students,
  loading,
  error,
  showActions = false,
  onInvite,
  onRemove,
  invitingEmails = new Set(),
}) => {
  const { sortedRows: sortedStudents, sort, toggleSort } = useTableSort<UiStudent, RosterSortKey>(
    students,
    SORT_ACCESSORS,
    { key: 'name', direction: 'asc' },
  );

  // TAs and dropped students don't count toward the roster total.
  const studentCount = countableStudents(students).filter((s) => s.classStatus !== 'dropped').length;

  if (loading) {
    const headers = ['Name', 'Email', 'Class Status', 'GrepThink Status', 'Projects'];
    if (showActions) headers.push('Actions');
    return (
      <TableSkeleton
        block="roster-list"
        title="Roster Count"
        headers={headers}
        rows={10}
        cellWidths={['70%', '85%', '90px', '90px', '50%', '70px']}
      />
    );
  }

  if (error) {
    return (
      <div className="roster-list">
        <div className="roster-list__header">
          <h2 className="roster-list__title">
            <StatTooltip label="Counts all non-dropped students in the uploaded roster" underline>Roster Count</StatTooltip>
          </h2>
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
        <h2 className="roster-list__title">
          <StatTooltip label="Counts all non-dropped students in the uploaded roster" underline>Roster Count</StatTooltip>
        </h2>
        <span className="roster-list__count-badge">{studentCount}</span>
      </div>

      {/* Desktop table */}
      <div className="roster-list__table-card">
        <div className="roster-list__table-wrapper">
          {students.length === 0 ? (
            <div className="roster-list__empty-state">
              No students match the current filter.
            </div>
          ) : (
            <table
              className={`roster-list__table${showActions ? '' : ' roster-list__table--no-actions'}`}
            >
              <thead>
                <tr>
                  <SortableHeader label="Name" sortKey="name" currentSort={sort} onSort={toggleSort} />
                  <SortableHeader label="Email" sortKey="email" currentSort={sort} onSort={toggleSort} />
                  <SortableHeader label="Class Status" sortKey="classStatus" currentSort={sort} onSort={toggleSort} />
                  <SortableHeader label="GrepThink Status" sortKey="grepthinkStatus" currentSort={sort} onSort={toggleSort} />
                  <SortableHeader label="Projects" sortKey="projects" currentSort={sort} onSort={toggleSort} />
                  {showActions && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedStudents.map((student) => (
                  <tr key={`${student.id}-${student.email}`}>
                    <td className="roster-list__td-name">
                      {student.name}
                      {student.isTa && <span className="roster-list__ta-badge">TA</span>}
                    </td>
                    <td className="roster-list__td-email">
                      <a href={`mailto:${student.email}`} className="roster-list__email-link">
                        {student.email}
                      </a>
                    </td>
                    <td>
                      <span className={`roster-list__badge roster-list__badge--class-${student.classStatus}`}>
                        {CLASS_STATUS_LABELS[student.classStatus]}
                      </span>
                    </td>
                    <td>
                      <span className={`roster-list__badge roster-list__badge--gt-${student.grepthinkStatus}`}>
                        {GREPTHINK_STATUS_LABELS[student.grepthinkStatus]}
                      </span>
                    </td>
                    <td>
                      <div className="roster-list__projects-wrap">
                        {student.projects.length === 0 ? (
                          <span className="roster-list__no-projects">—</span>
                        ) : (
                          student.projects.map((p) => (
                            <span key={p} className="roster-list__project-tag">{p}</span>
                          ))
                        )}
                      </div>
                    </td>
                    {showActions && (
                      <td className="roster-list__td-actions">
                        {student.grepthinkStatus === 'registered' ? (
                          <button className="roster-list__action-btn roster-list__action-btn--remove" onClick={() => onRemove?.(student)} type="button">
                            <UserMinus size={13} /> Remove
                          </button>
                        ) : (
                          <button
                            className="roster-list__action-btn roster-list__action-btn--invite"
                            onClick={() => onInvite?.(student)}
                            type="button"
                            disabled={invitingEmails.has(student.email)}
                          >
                            {invitingEmails.has(student.email) ? (
                              <Loader2 size={13} className="roster-list__spinner" />
                            ) : (
                              <Mail size={13} />
                            )}
                            {invitingEmails.has(student.email) ? 'Sending…' : 'Invite'}
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

      {/* Mobile cards — proper div structure avoids CSS grid/td browser quirks */}
      <div className="roster-list__mobile-cards">
        {students.length === 0 ? (
          <div className="roster-list__empty-state">No students match the current filter.</div>
        ) : (
          sortedStudents.map((student) => (
            <div key={`mobile-${student.id}-${student.email}`} className="roster-list__mobile-card">
              <div className="roster-list__mobile-card-top">
                <div className="roster-list__mobile-card-info">
                  <span className="roster-list__td-name">
                    {student.name}
                    {student.isTa && <span className="roster-list__ta-badge">TA</span>}
                  </span>
                  <a href={`mailto:${student.email}`} className="roster-list__email-link">
                    {student.email}
                  </a>
                </div>
                <div className="roster-list__mobile-card-badges">
                  <span className={`roster-list__badge roster-list__badge--class-${student.classStatus}`}>
                    {CLASS_STATUS_LABELS[student.classStatus]}
                  </span>
                  <span className={`roster-list__badge roster-list__badge--gt-${student.grepthinkStatus}`}>
                    {GREPTHINK_STATUS_LABELS[student.grepthinkStatus]}
                  </span>
                </div>
              </div>
              {student.projects.length > 0 && (
                <div className="roster-list__projects-wrap roster-list__projects-wrap--mobile">
                  {student.projects.map((p) => (
                    <span key={p} className="roster-list__project-tag">{p}</span>
                  ))}
                </div>
              )}
              {showActions && (
                <div className="roster-list__mobile-card-actions">
                  {student.grepthinkStatus === 'registered' ? (
                    <button className="roster-list__action-btn roster-list__action-btn--remove" onClick={() => onRemove?.(student)} type="button">
                      <UserMinus size={13} /> Remove
                    </button>
                  ) : (
                    <button
                      className="roster-list__action-btn roster-list__action-btn--invite"
                      onClick={() => onInvite?.(student)}
                      type="button"
                      disabled={invitingEmails.has(student.email)}
                    >
                      {invitingEmails.has(student.email) ? (
                        <Loader2 size={13} className="roster-list__spinner" />
                      ) : (
                        <Mail size={13} />
                      )}
                      {invitingEmails.has(student.email) ? 'Sending…' : 'Invite'}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default RosterList;

import React, { useState, useMemo } from 'react';
import { useClass } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import ControlBar from '@features/app/components/Roster/ControlBar';
import RosterList from '@features/app/components/Roster/RosterList';
import PieCharts from '@features/app/components/Roster/PieCharts';
import {
  MOCK_ROSTER,
  applyFilter,
  type FilterOption,
} from '@features/app/components/Roster/rosterTypes';
import './Roster.scss';

const Roster: React.FC = () => {
  const { selectedClass } = useClass();
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');

  // TODO: replace with api.getClassStudents() once backend returns full UiStudent shape
  const students = MOCK_ROSTER;

  const filtered = useMemo(() => {
    const byFilter = applyFilter(students, filter);
    if (!search.trim()) return byFilter;
    const q = search.toLowerCase();
    return byFilter.filter(
      (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [students, filter, search]);

  const notRegisteredCount = useMemo(
    () => students.filter((s) => s.grepthinkStatus === 'not_registered').length,
    [students],
  );

  if (!selectedClass) {
    return (
      <div className="roster">
        <div className="roster__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view the roster.</p>
        </div>
      </div>
    );
  }

  if (role === 'student') {
    return (
      <div className="roster">
        <ControlBar
          search={search}
          onSearchChange={setSearch}
          filter={filter}
          onFilterChange={setFilter}
        />
        <RosterList students={filtered} loading={false} error={null} showActions={false} />
      </div>
    );
  }

  return (
    <div className="roster">
      <ControlBar
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        notRegisteredCount={notRegisteredCount}
        onInviteAll={() => console.warn('Invite all (not yet implemented)')}
        onUploadRoster={() => console.warn('Upload roster (not yet implemented)')}
      />
      <div className="roster__layout">
        <div className="roster__main">
          <RosterList students={filtered} loading={false} error={null} showActions />
        </div>
        <div className="roster__sidebar">
          <PieCharts students={students} />
        </div>
      </div>
    </div>
  );
};

export default Roster;

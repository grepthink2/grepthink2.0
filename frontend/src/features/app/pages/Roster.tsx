import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useClass } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import ControlBar from '@features/app/components/Roster/ControlBar';
import RosterList from '@features/app/components/Roster/RosterList';
import PieCharts from '@features/app/components/Roster/PieCharts';
import {
  applyFilter,
  mapApiRosterStudent,
  type FilterOption,
  type UiStudent,
} from '@features/app/components/Roster/rosterTypes';
import './Roster.scss';

const Roster: React.FC = () => {
  const { selectedClass } = useClass();
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [students, setStudents] = useState<UiStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadRoster = useCallback(async (classId: string) => {
    setLoading(true);
    setError(null);
    try {
      const { students: rows } = await api.getClassRoster(classId);
      setStudents(rows.map(mapApiRosterStudent));
    } catch (err) {
      setStudents([]);
      setError(err instanceof Error ? err.message : 'Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedClass?.id) {
      setStudents([]);
      return;
    }
    void loadRoster(selectedClass.id);
  }, [selectedClass?.id, loadRoster]);

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

  const handleUploadRoster = async (file: File) => {
    if (!selectedClass?.id) return;
    if (
      !window.confirm(
        'Uploading a new roster will replace the current one for this class. Continue?',
      )
    ) {
      return;
    }

    setActionError(null);
    try {
      await api.uploadClassRoster(selectedClass.id, file);
      await loadRoster(selectedClass.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to upload roster');
    }
  };

  const handleInviteAll = async () => {
    if (!selectedClass?.id) return;
    const emails = students
      .filter((s) => s.grepthinkStatus === 'not_registered')
      .map((s) => s.email);
    if (emails.length === 0) return;

    setActionError(null);
    try {
      const result = await api.bulkInviteStudents(selectedClass.id, emails);
      const notFound = result.results.filter((r) => r.status === 'not_found').length;
      await loadRoster(selectedClass.id);
      if (notFound > 0) {
        setActionError(
          `Invited ${result.enrolled_count} student(s). ${notFound} email(s) have no GrepThink account yet.`,
        );
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to invite students');
    }
  };

  const handleInvite = async (student: UiStudent) => {
    if (!selectedClass?.id) return;
    setActionError(null);
    try {
      await api.inviteStudent(selectedClass.id, student.email);
      await loadRoster(selectedClass.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to invite student');
    }
  };

  const handleRemove = async (student: UiStudent) => {
    if (!selectedClass?.id) return;
    if (!window.confirm(`Remove ${student.name} from this class?`)) return;

    setActionError(null);
    try {
      await api.removeStudentFromClass(selectedClass.id, student.id);
      await loadRoster(selectedClass.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove student');
    }
  };

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
        <RosterList students={filtered} loading={loading} error={error} showActions={false} />
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
        onInviteAll={handleInviteAll}
        onRosterFileSelected={handleUploadRoster}
      />
      {actionError && (
        <div className="roster__action-error" role="alert">
          {actionError}
        </div>
      )}
      <div className="roster__layout">
        <div className="roster__main">
          <RosterList
            students={filtered}
            loading={loading}
            error={error}
            showActions
            onInvite={handleInvite}
            onRemove={handleRemove}
          />
        </div>
        <div className="roster__sidebar">
          <PieCharts students={students} />
        </div>
      </div>
    </div>
  );
};

export default Roster;

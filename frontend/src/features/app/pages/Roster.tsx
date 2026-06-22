import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useClass } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import ControlBar from '@features/app/components/Roster/ControlBar';
import RosterList from '@features/app/components/Roster/RosterList';
import PieCharts from '@features/app/components/Roster/PieCharts';
import {
  applyFilter,
  isBulkInviteCandidate,
  mapApiRosterStudent,
  type FilterOption,
  type UiStudent,
} from '@features/app/components/Roster/rosterTypes';
import './Roster.scss';

interface ActionMessage {
  type: 'success' | 'error';
  text: string;
}

const Roster: React.FC = () => {
  const { selectedClass } = useClass();
  const { role } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [students, setStudents] = useState<UiStudent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const [inviteAllLoading, setInviteAllLoading] = useState(false);
  const [invitingEmails, setInvitingEmails] = useState<Set<string>>(new Set());
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    setActionMessage({ type, text });
    if (type === 'success') {
      dismissTimerRef.current = setTimeout(() => setActionMessage(null), 4000);
    }
  }, []);

  const loadRoster = useCallback(async (classId: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { students: rows } = await api.getClassRoster(classId);
      setStudents(rows.map(mapApiRosterStudent));
    } catch (err) {
      setStudents([]);
      setError(err instanceof Error ? err.message : 'Failed to load roster');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSearch('');
    setFilter('all');
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
    () => students.filter(isBulkInviteCandidate).length,
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

    setActionMessage(null);
    try {
      await api.uploadClassRoster(selectedClass.id, file);
      await loadRoster(selectedClass.id, true);
      showMessage('success', 'Roster uploaded successfully.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to upload roster');
    }
  };

  const handleInviteAll = async () => {
    if (!selectedClass?.id) return;
    const emails = students.filter(isBulkInviteCandidate).map((s) => s.email);
    if (emails.length === 0) return;

    setActionMessage(null);
    setInviteAllLoading(true);
    try {
      const result = await api.bulkInviteStudents(selectedClass.id, emails);
      const emailFailed = result.results.filter((r) => r.status === 'email_failed').length;
      await loadRoster(selectedClass.id, true);
      const parts: string[] = [];
      if (result.invited_count > 0) {
        parts.push(`Sent ${result.invited_count} signup invitation${result.invited_count !== 1 ? 's' : ''}`);
      }
      if (result.enrolled_count > 0) {
        parts.push(`Enrolled ${result.enrolled_count} registered student${result.enrolled_count !== 1 ? 's' : ''}`);
      }
      if (emailFailed > 0) {
        parts.push(`${emailFailed} email${emailFailed !== 1 ? 's' : ''} could not be delivered`);
      }
      const hasErrors = emailFailed > 0 && result.invited_count === 0 && result.enrolled_count === 0;
      showMessage(hasErrors ? 'error' : 'success', (parts.join('. ') || 'Done') + '.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to invite students');
    } finally {
      setInviteAllLoading(false);
    }
  };

  const handleInvite = async (student: UiStudent) => {
    if (!selectedClass?.id) return;
    setActionMessage(null);
    setInvitingEmails((prev) => new Set(prev).add(student.email));
    try {
      await api.inviteStudent(selectedClass.id, student.email);
      await loadRoster(selectedClass.id, true);
      showMessage('success', `Invitation sent to ${student.name}.`);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to invite student');
    } finally {
      setInvitingEmails((prev) => {
        const next = new Set(prev);
        next.delete(student.email);
        return next;
      });
    }
  };

  const handleRemove = async (student: UiStudent) => {
    if (!selectedClass?.id) return;
    if (!window.confirm(`Remove ${student.name} from this class?`)) return;

    setActionMessage(null);
    try {
      await api.removeStudentFromClass(selectedClass.id, student.id);
      await loadRoster(selectedClass.id, true);
      showMessage('success', `${student.name} removed from the class.`);
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to remove student');
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
        <RosterList key={selectedClass?.id} students={filtered} loading={loading} error={error} showActions={false} />
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
        inviteAllLoading={inviteAllLoading}
      />
      {actionMessage && (
        <div
          className={`roster__action-message roster__action-message--${actionMessage.type}`}
          role="alert"
        >
          {actionMessage.text}
          <button
            className="roster__action-message-dismiss"
            onClick={() => setActionMessage(null)}
            type="button"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <div className="roster__layout">
        <div className="roster__main">
          <RosterList
            key={selectedClass?.id}
            students={filtered}
            loading={loading}
            error={error}
            showActions
            onInvite={handleInvite}
            onRemove={handleRemove}
            invitingEmails={invitingEmails}
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

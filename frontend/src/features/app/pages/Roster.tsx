import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useClass } from '@/lib/classContext';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import ControlBar from '@features/app/components/Roster/ControlBar';
import RosterList from '@features/app/components/Roster/RosterList';
import PieCharts from '@features/app/components/Roster/PieCharts';
import InviteModal, { type InvitePayload } from '@features/app/components/Roster/InviteModal';
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

interface UnsendJob {
  jobId: string;
  classId: string;
  secondsLeft: number;
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
  const [inviteModal, setInviteModal] = useState<{ initialEmails: string[] } | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [unsendJob, setUnsendJob] = useState<UnsendJob | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearUnsend = useCallback(() => {
    if (unsendIntervalRef.current) {
      clearInterval(unsendIntervalRef.current);
      unsendIntervalRef.current = null;
    }
    setUnsendJob(null);
  }, []);

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

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (unsendIntervalRef.current) clearInterval(unsendIntervalRef.current);
    };
  }, []);

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

  const handleInviteAll = () => {
    if (!selectedClass?.id) return;
    const emails = students.filter(isBulkInviteCandidate).map((s) => s.email);
    if (emails.length === 0) return;
    setModalError(null);
    setInviteModal({ initialEmails: emails });
  };

  const handleInvite = (student: UiStudent) => {
    setModalError(null);
    setInviteModal({ initialEmails: [student.email] });
  };

  const startUnsendCountdown = useCallback((jobId: string, classId: string) => {
    clearUnsend();
    setUnsendJob({ jobId, classId, secondsLeft: 60 });
    unsendIntervalRef.current = setInterval(() => {
      setUnsendJob((prev) => {
        if (!prev) return null;
        if (prev.secondsLeft <= 1) {
          clearInterval(unsendIntervalRef.current!);
          unsendIntervalRef.current = null;
          void loadRoster(prev.classId, true);
          setActionMessage(null);
          return null;
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
  }, [clearUnsend, loadRoster]);

  const handleModalSend = async ({ emails, cc, bcc, subject, body, bodyHtml }: InvitePayload) => {
    if (!selectedClass?.id) return;
    setIsSendingInvite(true);
    setModalError(null);
    try {
      const result = await api.queueInvite(selectedClass.id, emails, subject, body, bodyHtml, cc, bcc);
      setInviteModal(null);
      // Don't use showMessage here — it auto-dismisses after 4s, but we need
      // the banner to stay for the full 60s unsend window.
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      setActionMessage({ type: 'success', text: `${emails.length} invitation${emails.length !== 1 ? 's' : ''} queued.` });
      startUnsendCountdown(result.job_id, selectedClass.id);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to send invitations');
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleUnsend = async () => {
    if (!unsendJob) return;
    clearUnsend();
    try {
      await api.cancelInvite(unsendJob.classId, unsendJob.jobId);
      showMessage('success', 'Invitations cancelled.');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Could not cancel invitations');
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

  const formatCountdown = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(1, '0')}:${String(s % 60).padStart(2, '0')}`;

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
        inviteAllLoading={false}
      />
      {actionMessage && (
        <div
          className={`roster__action-message roster__action-message--${actionMessage.type}`}
          role="alert"
        >
          <span>{actionMessage.text}</span>
          {unsendJob && actionMessage.type === 'success' && (
            <button
              className="roster__unsend-btn"
              onClick={handleUnsend}
              type="button"
            >
              Unsend ({formatCountdown(unsendJob.secondsLeft)})
            </button>
          )}
          <button
            className="roster__action-message-dismiss"
            onClick={() => {
              setActionMessage(null);
              clearUnsend();
            }}
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
            invitingEmails={new Set()}
          />
        </div>
        <div className="roster__sidebar">
          <PieCharts students={students} />
        </div>
      </div>

      <InviteModal
        isOpen={inviteModal !== null}
        onClose={() => setInviteModal(null)}
        onSend={handleModalSend}
        initialEmails={inviteModal?.initialEmails ?? []}
        className={selectedClass.name}
        courseCode={selectedClass.course_code ?? ''}
        isSending={isSendingInvite}
        errorMessage={modalError}
      />
    </div>
  );
};

export default Roster;

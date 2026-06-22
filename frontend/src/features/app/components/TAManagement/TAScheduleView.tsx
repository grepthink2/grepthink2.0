import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCog } from 'lucide-react';
import { api, type ApiTAMeetingSchedule } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import TeamMeetingCard from './TeamMeetingCard';
import WeekNavigator from './WeekNavigator';
import AddZoomModal from './AddZoomModal';
import DesignateTAsModal from './DesignateTAsModal';
import {
  toTeamMeetingItem,
  type AttendanceRow,
  type AttendanceStatus,
  type TeamMeetingItem,
} from './taTypes';
import './TAManagement.scss';

type Scope = 'all' | 'mine' | 'my-team';

interface TAScheduleViewProps {
  title: string;
  subtitle?: string;
  scope: Scope;
  /** Can edit Zoom + mark attendance. */
  editable: boolean;
  /** Instructor: assign a TA per team + manage class TAs. */
  assignable: boolean;
  /** Student: show the viewer's own status instead of team tallies. */
  readOnlyOwn?: boolean;
  emptyMessage: string;
}

const fetchSchedule = (scope: Scope, classId: string, week: number | null) => {
  const w = week ?? undefined;
  if (scope === 'mine') return api.getMyAssignedTeams(classId, w);
  if (scope === 'my-team') return api.getMyTeamSchedule(classId, w);
  return api.getTAMeetingSchedule(classId, w);
};

const TAScheduleView: React.FC<TAScheduleViewProps> = ({
  title, subtitle, scope, editable, assignable, readOnlyOwn = false, emptyMessage,
}) => {
  const { selectedClass } = useClass();
  const classId = selectedClass?.id ?? null;

  const [schedule, setSchedule] = useState<ApiTAMeetingSchedule | null>(null);
  const [week, setWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [roster, setRoster] = useState<AttendanceRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);

  const [ownStatusMap, setOwnStatusMap] = useState<Record<string, AttendanceStatus>>({});
  const [taOptions, setTaOptions] = useState<{ id: string; name: string }[]>([]);
  const [zoomTeam, setZoomTeam] = useState<TeamMeetingItem | null>(null);
  const [designateOpen, setDesignateOpen] = useState(false);

  // Reset week when switching classes (so each class shows its current week).
  useEffect(() => { setWeek(null); setExpandedId(null); }, [classId]);

  const loadSchedule = useCallback(async () => {
    if (!classId) { setSchedule(null); setLoading(false); return; }
    try {
      setLoading(true);
      const res = await fetchSchedule(scope, classId, week);
      setSchedule(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
      setSchedule(null);
    } finally {
      setLoading(false);
    }
  }, [classId, scope, week]);

  useEffect(() => { void loadSchedule(); }, [loadSchedule]);

  // Load class TA options (for the assign-TA dropdown) — instructor only.
  const loadTaOptions = useCallback(async () => {
    if (!assignable || !classId) return;
    try {
      const res = await api.getClassTaRoster(classId);
      setTaOptions(res.tas.filter((t) => t.is_ta).map((t) => ({ id: t.user_id, name: t.name ?? 'TA' })));
    } catch {
      setTaOptions([]);
    }
  }, [assignable, classId]);

  useEffect(() => { void loadTaOptions(); }, [loadTaOptions]);

  // Student view: resolve the viewer's own status per team.
  useEffect(() => {
    if (!readOnlyOwn || !schedule) return;
    let active = true;
    (async () => {
      const map: Record<string, AttendanceStatus> = {};
      for (const t of schedule.teams) {
        try {
          const att = await api.getTeamAttendance(t.project_id, schedule.week_number);
          map[t.project_id] = att.entries[0]?.status ?? 'unmarked';
        } catch {
          map[t.project_id] = 'unmarked';
        }
      }
      if (active) setOwnStatusMap(map);
    })();
    return () => { active = false; };
  }, [readOnlyOwn, schedule]);

  const effWeek = schedule?.week_number ?? 1;
  const totalWeeks = schedule?.total_weeks ?? 1;
  const teams = useMemo(() => (schedule?.teams ?? []).map(toTeamMeetingItem), [schedule]);

  const patchTeam = useCallback((projectId: string, patch: Partial<TeamMeetingItem>) => {
    setSchedule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        teams: prev.teams.map((t) => {
          if (t.project_id !== projectId) return t;
          return {
            ...t,
            zoom_url: patch.zoomUrl !== undefined ? patch.zoomUrl : t.zoom_url,
            meeting_day: patch.meetingDay !== undefined ? patch.meetingDay : t.meeting_day,
            meeting_time: patch.meetingTime !== undefined ? patch.meetingTime : t.meeting_time,
            attendance_present: patch.present !== undefined ? patch.present : t.attendance_present,
            assigned_ta: patch.assignedTa !== undefined
              ? (patch.assignedTa ? { id: patch.assignedTa.id, name: patch.assignedTa.name, email: patch.assignedTa.email } : null)
              : t.assigned_ta,
          };
        }),
      };
    });
  }, []);

  const handleToggleExpand = useCallback(async (projectId: string) => {
    if (expandedId === projectId) { setExpandedId(null); return; }
    setExpandedId(projectId);
    setRoster([]);
    setRosterLoading(true);
    try {
      const res = await api.getTeamAttendance(projectId, effWeek);
      setRoster(res.entries.map((e) => ({
        personId: e.person_id, name: e.name ?? e.email ?? 'Student', email: e.email, status: e.status,
      })));
    } catch {
      setRoster([]);
    } finally {
      setRosterLoading(false);
    }
  }, [expandedId, effWeek]);

  const presentCount = (rows: AttendanceRow[]) => rows.filter((r) => r.status === 'present').length;

  const handleMark = useCallback(async (projectId: string, personId: string, status: 'present' | 'late' | 'absent') => {
    const prevRows = roster;
    const nextRows = roster.map((r) => (r.personId === personId ? { ...r, status } : r));
    setRoster(nextRows);
    patchTeam(projectId, { present: presentCount(nextRows) });
    try {
      await api.upsertAttendance(projectId, effWeek, personId, status);
    } catch {
      setRoster(prevRows);
      patchTeam(projectId, { present: presentCount(prevRows) });
    }
  }, [roster, effWeek, patchTeam]);

  const handleMarkAll = useCallback(async (projectId: string) => {
    const prevRows = roster;
    const nextRows = roster.map((r) => ({ ...r, status: 'present' as AttendanceStatus }));
    setRoster(nextRows);
    patchTeam(projectId, { present: nextRows.length });
    try {
      await api.markAllPresent(projectId, effWeek);
    } catch {
      setRoster(prevRows);
      patchTeam(projectId, { present: presentCount(prevRows) });
    }
  }, [roster, effWeek, patchTeam]);

  const handleAssignTa = useCallback(async (projectId: string, taId: string | null) => {
    const opt = taId ? taOptions.find((o) => o.id === taId) ?? null : null;
    patchTeam(projectId, { assignedTa: opt ? { id: opt.id, name: opt.name } : null });
    try {
      await api.assignProjectTA(projectId, taId);
    } catch {
      void loadSchedule();
    }
  }, [taOptions, patchTeam, loadSchedule]);

  if (!selectedClass) {
    return (
      <div className="ta-page">
        <div className="ta-page__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view the meeting schedule.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ta-page">
      <header className="ta-page__topbar">
        <div className="ta-page__heading">
          <h2 className="ta-page__title">{title}</h2>
          <span className="ta-page__subtitle">{subtitle ?? 'Weekly meetings'}</span>
        </div>
        <div className="ta-page__topbar-actions">
          {assignable && (
            <button type="button" className="ta-page__manage-btn" onClick={() => setDesignateOpen(true)}>
              <UserCog size={16} /> Manage TAs
            </button>
          )}
          {schedule && (
            <WeekNavigator
              weekNumber={effWeek}
              totalWeeks={totalWeeks}
              weekOf={schedule.week_of}
              onPrev={() => setWeek(Math.max(1, effWeek - 1))}
              onNext={() => setWeek(Math.min(totalWeeks, effWeek + 1))}
            />
          )}
        </div>
      </header>

      <div className="ta-page__section-head">
        <span className="ta-page__section-title">
          {scope === 'my-team' ? 'My team' : scope === 'mine' ? 'My assigned teams' : 'Teams'}
        </span>
        {schedule && <span className="ta-page__count">{teams.length}</span>}
      </div>
      <div className="ta-page__divider" />

      {loading ? (
        <div className="ta-page__empty"><p>Loading…</p></div>
      ) : error ? (
        <div className="ta-page__empty"><p>Error: {error}</p></div>
      ) : teams.length === 0 ? (
        <div className="ta-page__empty ta-page__empty--stack">
          <p className="ta-page__empty-text">{emptyMessage}</p>
        </div>
      ) : (
        <div className="ta-page__list">
          {teams.map((team) => (
            <TeamMeetingCard
              key={team.projectId}
              item={team}
              weekNumber={effWeek}
              editable={editable}
              expandable={editable}
              expanded={expandedId === team.projectId}
              onToggleExpand={() => handleToggleExpand(team.projectId)}
              roster={expandedId === team.projectId ? roster : undefined}
              rosterLoading={expandedId === team.projectId && rosterLoading}
              ownStatus={readOnlyOwn ? (ownStatusMap[team.projectId] ?? 'unmarked') : undefined}
              assignable={assignable}
              taOptions={taOptions}
              onAssignTa={(taId) => handleAssignTa(team.projectId, taId)}
              onAddZoom={() => setZoomTeam(team)}
              onMark={(personId, status) => handleMark(team.projectId, personId, status)}
              onMarkAllPresent={() => handleMarkAll(team.projectId)}
            />
          ))}
        </div>
      )}

      <AddZoomModal
        isOpen={zoomTeam !== null}
        team={zoomTeam}
        onClose={() => setZoomTeam(null)}
        onSaved={(projectId, fields) => patchTeam(projectId, fields)}
      />
      <DesignateTAsModal
        isOpen={designateOpen}
        classId={classId}
        onClose={() => setDesignateOpen(false)}
        onChanged={() => { void loadTaOptions(); void loadSchedule(); }}
      />
    </div>
  );
};

export default TAScheduleView;

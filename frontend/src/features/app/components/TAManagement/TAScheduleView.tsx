import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCog } from 'lucide-react';
import { api, type ApiTAMeetingSchedule, type ApiAttendanceEntry } from '@/lib/api';
import { Skeleton } from '@/components/Skeleton/Skeleton';
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
  /** Instructor: assign a TA per team + manage class TAs + set cadence. */
  assignable: boolean;
  /** Student: show the viewer's own status instead of team tallies. */
  readOnlyOwn?: boolean;
  emptyMessage: string;
}

const fetchSchedule = (scope: Scope, classId: string, week: number | null, meeting: number | null) => {
  const w = week ?? undefined;
  const m = meeting ?? undefined; // omit -> server picks the current/next meeting
  if (scope === 'mine') return api.getMyAssignedTeams(classId, w, m);
  if (scope === 'my-team') return api.getMyTeamSchedule(classId, w, m);
  return api.getTAMeetingSchedule(classId, w, m);
};

const toRoster = (entries: ApiAttendanceEntry[]): AttendanceRow[] =>
  entries.map((e) => ({ personId: e.person_id, name: e.name ?? e.email ?? 'Student', email: e.email, status: e.status }));

/** The roster shown while a team's attendance loads (one shared array, so memoized handlers stay put). */
const NO_ROWS: AttendanceRow[] = [];

const TAScheduleView: React.FC<TAScheduleViewProps> = ({
  title, subtitle, scope, editable, assignable, readOnlyOwn = false, emptyMessage,
}) => {
  const { selectedClass } = useClass();
  const classId = selectedClass?.id ?? null;

  const [week, setWeek] = useState<number | null>(null);
  // null = "auto": let the server default to the meeting happening now / next.
  const [meeting, setMeeting] = useState<number | null>(null);
  // Bumped after a change to fetch the schedule / the TA options again.
  const [scheduleReloads, setScheduleReloads] = useState(0);
  const [taOptionsReloads, setTaOptionsReloads] = useState(0);
  /** The latest schedule response and the request it answered; it stays on screen while the next one loads. */
  const [scheduleResult, setScheduleResult] = useState<{
    key: string;
    schedule: ApiTAMeetingSchedule | null;
    error: string | null;
  } | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  /** The latest roster response and the request it answered. */
  const [rosterResult, setRosterResult] = useState<{ key: string; rows: AttendanceRow[] } | null>(null);

  const [taOptions, setTaOptions] = useState<{ id: string; name: string }[]>([]);
  const [zoomTeam, setZoomTeam] = useState<TeamMeetingItem | null>(null);
  const [designateOpen, setDesignateOpen] = useState(false);
  /** A cadence change in flight: saving it, then waiting for the schedule to reload. */
  const [cadenceSave, setCadenceSave] = useState<'saving' | 'reloading' | null>(null);

  // Reset week/meeting when switching classes; with no class, drop the schedule.
  const [prevClassId, setPrevClassId] = useState(classId);
  if (prevClassId !== classId) {
    setPrevClassId(classId);
    setWeek(null);
    setMeeting(null);
    setExpandedId(null);
    if (!classId) setScheduleResult(null);
  }

  const scheduleKey = classId ? JSON.stringify([scope, classId, week, meeting, scheduleReloads]) : null;
  const schedule = scheduleResult?.schedule ?? null;
  const loading = scheduleKey !== null && scheduleResult?.key !== scheduleKey;
  const error = scheduleResult?.error ?? null;

  useEffect(() => {
    if (!classId || !scheduleKey) return;
    let active = true;
    fetchSchedule(scope, classId, week, meeting)
      .then((res) => {
        if (active) setScheduleResult({ key: scheduleKey, schedule: res, error: null });
      })
      .catch((err) => {
        if (!active) return;
        setScheduleResult({
          key: scheduleKey,
          schedule: null,
          error: err instanceof Error ? err.message : 'Failed to load schedule',
        });
      });
    return () => { active = false; };
  }, [classId, scope, week, meeting, scheduleKey]);

  // A cadence change keeps its select disabled until the schedule it reloads has landed.
  if (cadenceSave === 'reloading' && !loading) {
    setCadenceSave(null);
  }
  const savingCadence = cadenceSave !== null;

  // Load class TA options (for the assign-TA dropdown) — instructor only.
  useEffect(() => {
    if (!assignable || !classId) return;
    let active = true;
    api.getClassTaRoster(classId)
      .then((res) => {
        if (active) setTaOptions(res.tas.filter((t) => t.is_ta).map((t) => ({ id: t.user_id, name: t.name ?? 'TA' })));
      })
      .catch(() => {
        if (active) setTaOptions([]);
      });
    return () => { active = false; };
  }, [assignable, classId, taOptionsReloads]);

  const effWeek = schedule?.week_number ?? 1;
  const totalWeeks = schedule?.total_weeks ?? 1;
  const meetingsPerWeek = schedule?.meetings_per_week ?? 1;
  const meetingDuration = schedule?.meeting_duration_minutes ?? null;
  const teams = useMemo(() => (schedule?.teams ?? []).map(toTeamMeetingItem), [schedule]);
  // Resolved meeting-in-week: the user's explicit pick, else the server's
  // current/next choice (echoed back as meeting_in_week).
  const effMeeting = meeting ?? schedule?.meeting_in_week ?? 1;

  // Keep an explicit selection within cadence; otherwise fall back to auto.
  if (meeting != null && meeting > meetingsPerWeek) {
    setMeeting(null);
  }

  // (Re)load the expanded team's roster whenever the team, week, or meeting changes.
  const rosterKey = expandedId ? JSON.stringify([expandedId, effWeek, effMeeting]) : null;
  const rosterLoading = rosterKey !== null && rosterResult?.key !== rosterKey;
  const roster = rosterResult !== null && rosterResult.key === rosterKey ? rosterResult.rows : NO_ROWS;

  useEffect(() => {
    if (!expandedId || !rosterKey) return;
    let active = true;
    api.getTeamAttendance(expandedId, effWeek, effMeeting)
      .then((res) => { if (active) setRosterResult({ key: rosterKey, rows: toRoster(res.entries) }); })
      .catch(() => { if (active) setRosterResult({ key: rosterKey, rows: [] }); });
    return () => { active = false; };
  }, [expandedId, effWeek, effMeeting, rosterKey]);

  // Student view: the schedule already carries the viewer's own status per team
  // for the resolved meeting, so no per-team attendance requests are needed.
  const ownStatusMap = useMemo(() => {
    const map: Record<string, AttendanceStatus> = {};
    for (const t of schedule?.teams ?? []) map[t.project_id] = t.viewer_status ?? 'unmarked';
    return map;
  }, [schedule]);

  const patchTeam = useCallback((projectId: string, patch: Partial<TeamMeetingItem>) => {
    setScheduleResult((result) => {
      const prev = result?.schedule;
      if (!result || !prev) return result;
      return {
        ...result,
        schedule: {
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
        },
      };
    });
  }, []);

  const handleToggleExpand = useCallback((projectId: string) => {
    setExpandedId((cur) => (cur === projectId ? null : projectId));
    // Expanding a team (again) always shows a fresh load of its roster.
    setRosterResult(null);
  }, []);

  const presentCount = (rows: AttendanceRow[]) => rows.filter((r) => r.status === 'present').length;

  /** Replaces the rows of the roster loaded for `key` (an optimistic mark or its rollback). */
  const setRosterRows = useCallback((key: string | null, rows: AttendanceRow[]) => {
    setRosterResult((cur) => (cur !== null && cur.key === key ? { key: cur.key, rows } : cur));
  }, []);

  const handleMark = useCallback(async (projectId: string, personId: string, status: 'present' | 'late' | 'absent') => {
    const prevRows = roster;
    const nextRows = roster.map((r) => (r.personId === personId ? { ...r, status } : r));
    setRosterRows(rosterKey, nextRows);
    patchTeam(projectId, { present: presentCount(nextRows) });
    try {
      await api.upsertAttendance(projectId, effWeek, personId, status, effMeeting);
    } catch {
      setRosterRows(rosterKey, prevRows);
      patchTeam(projectId, { present: presentCount(prevRows) });
    }
  }, [roster, rosterKey, effWeek, effMeeting, patchTeam, setRosterRows]);

  const handleMarkAll = useCallback(async (projectId: string) => {
    const prevRows = roster;
    const nextRows = roster.map((r) => ({ ...r, status: 'present' as AttendanceStatus }));
    setRosterRows(rosterKey, nextRows);
    patchTeam(projectId, { present: nextRows.length });
    try {
      await api.markAllPresent(projectId, effWeek, effMeeting);
    } catch {
      setRosterRows(rosterKey, prevRows);
      patchTeam(projectId, { present: presentCount(prevRows) });
    }
  }, [roster, rosterKey, effWeek, effMeeting, patchTeam, setRosterRows]);

  const handleAssignTa = useCallback(async (projectId: string, taId: string | null) => {
    const opt = taId ? taOptions.find((o) => o.id === taId) ?? null : null;
    patchTeam(projectId, { assignedTa: opt ? { id: opt.id, name: opt.name } : null });
    try {
      await api.assignProjectTA(projectId, taId);
    } catch {
      setScheduleReloads((n) => n + 1);
    }
  }, [taOptions, patchTeam]);

  const handleSetCadence = useCallback(async (patch: { meetings_per_week?: number; meeting_duration_minutes?: number }) => {
    if (!classId) return;
    setCadenceSave('saving');
    try {
      await api.setMeetingCadence(classId, patch);
      setCadenceSave('reloading');
      setScheduleReloads((n) => n + 1);
    } catch {
      // leave the schedule as-is on failure
      setCadenceSave(null);
    }
  }, [classId]);

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

  const cadenceLabel = `${meetingsPerWeek}×/week${meetingDuration ? ` · ${meetingDuration} min` : ''}`;

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
        {schedule && (
          assignable ? (
            <label className="ta-page__cadence-edit">
              <span>Meetings/week</span>
              <select
                value={meetingsPerWeek}
                disabled={savingCadence}
                onChange={(e) => handleSetCadence({ meetings_per_week: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {meetingDuration != null && <span className="ta-page__cadence-dur">· {meetingDuration} min</span>}
            </label>
          ) : (
            <span className="ta-page__cadence">{cadenceLabel}</span>
          )
        )}
      </div>

      {schedule && meetingsPerWeek > 1 && (
        <div className="ta-page__meeting-tabs" role="tablist" aria-label="Meeting within the week">
          {Array.from({ length: meetingsPerWeek }, (_, i) => i + 1).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={m === effMeeting}
              className={`ta-page__meeting-tab ${m === effMeeting ? 'is-active' : ''}`}
              onClick={() => setMeeting(m)}
            >
              Meeting {m}
            </button>
          ))}
        </div>
      )}

      <div className="ta-page__divider" />

      {loading ? (
        <div className="ta-page__list" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="ta-card" key={i}>
              <div className="ta-card__header">
                <div className="ta-card__name-block">
                  <Skeleton width={140} height={14} />
                  <Skeleton width={80} height={11} style={{ marginTop: 6 }} />
                </div>
              </div>
              <div className="ta-card__meta">
                <div className="ta-card__col">
                  <Skeleton width={90} height={10} />
                  <Skeleton width={110} height={13} style={{ marginTop: 6 }} />
                </div>
                <div className="ta-card__col">
                  <Skeleton width={90} height={10} />
                  <Skeleton width={110} height={13} style={{ marginTop: 6 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
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
              meetingInWeek={meetingsPerWeek > 1 ? effMeeting : undefined}
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
        meetingInWeek={effMeeting}
        onClose={() => setZoomTeam(null)}
        onSaved={(projectId, fields) => patchTeam(projectId, fields)}
      />
      <DesignateTAsModal
        isOpen={designateOpen}
        classId={classId}
        onClose={() => setDesignateOpen(false)}
        onChanged={() => { setTaOptionsReloads((n) => n + 1); setScheduleReloads((n) => n + 1); }}
      />
    </div>
  );
};

export default TAScheduleView;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type {
  ApiStaffingAssignmentRow,
  ApiStaffingProjectRank,
  ApiStaffingStudent,
} from '@/lib/api';
import AssignSummaryBar from './AssignSummaryBar';
import StudentsPanel from './StudentsPanel';
import ProjectAssignmentPanel from './ProjectAssignmentPanel';
import type { AssignProject, ProjectPreference, Student } from './assignTypes';
import { buildWorkWithGroups, compareStudentDisplayName } from './workWithGroups';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import './Assign.scss';

type Assignments = Record<string, (string | null)[]>;

/**
 * Build the per-project slot map used by the drag-and-drop UI from the
 * authoritative backend assignment list. Each slot array has length
 * ``team_size``; staffed students fill the leading slots in alphabetical
 * order so re-renders are deterministic between refetches.
 */
function buildAssignments(
  projects: AssignProject[],
  rows: ApiStaffingAssignmentRow[],
): Assignments {
  const result: Assignments = {};
  projects.forEach((p) => {
    result[p.id] = Array.from({ length: p.totalSeats }, () => null);
  });

  // Group assigned users by project so we can fill slots stably.
  const byProject = new Map<string, ApiStaffingAssignmentRow[]>();
  rows.forEach((row) => {
    if (!row.assigned_project_id) return;
    const list = byProject.get(row.assigned_project_id) ?? [];
    list.push(row);
    byProject.set(row.assigned_project_id, list);
  });

  byProject.forEach((users, projectId) => {
    users.sort((a, b) =>
      (a.user_name ?? '').toLowerCase().localeCompare((b.user_name ?? '').toLowerCase()),
    );
    let slots = result[projectId];
    if (!slots) {
      // Backend has more members than the project's configured team_size
      // (legacy data or capacity was reduced). Grow the slot array so we
      // never drop a staffed student silently.
      slots = Array.from({ length: users.length }, () => null);
      result[projectId] = slots;
    } else if (slots.length < users.length) {
      while (slots.length < users.length) slots.push(null);
    }
    users.forEach((u, idx) => {
      slots![idx] = u.user_id;
    });
  });

  return result;
}

function cloneAssignmentRows(
  rows: ApiStaffingAssignmentRow[],
): ApiStaffingAssignmentRow[] {
  return rows.map((r) => ({ ...r }));
}

function assignmentMap(
  rows: ApiStaffingAssignmentRow[],
): Map<string, string | null> {
  return new Map(
    rows.map((r) => [r.user_id, r.assigned_project_id ?? null]),
  );
}

function assignmentMapsEqual(
  a: Map<string, string | null>,
  b: Map<string, string | null>,
): boolean {
  if (a.size !== b.size) return false;
  for (const [userId, projectId] of a) {
    if (b.get(userId) !== projectId) return false;
  }
  return true;
}

/** Convert the backend's project-rank rows into the AssignProject shape. */
function toAssignProject(row: ApiStaffingProjectRank): AssignProject {
  return {
    id:         row.project_id,
    name:       row.project_name ?? 'Untitled project',
    sponsor:    '',
    popularity: row.strength,
    seatsTaken: row.num_staff,
    totalSeats: row.team_size,
  };
}

/**
 * Map the staffing/students payload (which already carries preferences,
 * peer lists, and the assigned-project) to the local Student shape used
 * by the assignment panel. ``focusedProjectId`` lets us populate the
 * heart / matches counters that sit next to each student.
 */
function toStudent(
  row: ApiStaffingStudent,
  focusedProjectId: string | null,
  projectsById: Map<string, AssignProject>,
): Student {
  const preferences: ProjectPreference[] = row.preferences.map((p) => ({
    projectId:   p.project_id,
    projectName: p.project_name ?? 'Project',
    rating:      p.interest_value,
    reason:      p.interest_reason ?? '',
  }));

  const focusedRating = focusedProjectId
    ? preferences.find((p) => p.projectId === focusedProjectId)?.rating ?? 0
    : 0;

  // "available matches" mirrors the spreadsheet semantics: the number of
  // ranked projects (other than this student's current assignment) that
  // still have an open seat.
  const currentAssignmentId = row.assigned_project ? row.assigned_project.project_id : null;
  const availableMatches = preferences.reduce((acc, pref) => {
    if (pref.projectId === currentAssignmentId) return acc;
    const project = projectsById.get(pref.projectId);
    if (!project) return acc;
    return project.seatsTaken < project.totalSeats ? acc + 1 : acc;
  }, 0);

  return {
    id:                  row.user_id,
    name:                row.user_name ?? row.user_email ?? 'Student',
    email:               row.user_email ?? '',
    interest:            { forFocusedProject: focusedRating, availableMatches },
    notes:               row.notes ?? undefined,
    previousProjectName: row.previous_project_name ?? undefined,
    takingCS115C:        Boolean(row.taking_115c),
    preferences,
    // Each student's "I want to work with" list becomes the directed
    // teammate edges that drive the nested-tree layout in StudentsPanel.
    teammateIds: row.work_with.map((p) => p.user_id),
  };
}

const Assign: React.FC = () => {
  const navigate = useNavigate();
  const { selectedClass } = useClass();
  const classId = selectedClass?.id ?? null;

  const [projects, setProjects] = useState<AssignProject[]>([]);
  const [studentRows, setStudentRows] = useState<ApiStaffingStudent[]>([]);
  const [assignmentRows, setAssignmentRows] = useState<ApiStaffingAssignmentRow[]>([]);
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedAssignmentRows, setSavedAssignmentRows] = useState<
    ApiStaffingAssignmentRow[]
  >([]);

  const refresh = useCallback(async (showSpinner = false) => {
    if (!classId) {
      setProjects([]);
      setStudentRows([]);
      setAssignmentRows([]);
      setLoading(false);
      return;
    }
    setError(null);
    if (showSpinner) setLoading(true);
    try {
      const [rankRes, studentRes, assignRes] = await Promise.all([
        api.getStaffingProjectRank(classId),
        api.getStaffingStudents(classId),
        api.getStaffingAssignments(classId),
      ]);
      const nextProjects = rankRes.projects.map(toAssignProject);
      setProjects(nextProjects);
      setStudentRows(studentRes.students);
      setAssignmentRows(assignRes.assignments);
      setSavedAssignmentRows(cloneAssignmentRows(assignRes.assignments));
      setSaveMessage(null);
      // Preserve the focused project across refreshes when possible.
      setFocusedProjectId((curr) => {
        if (curr && nextProjects.some((p) => p.id === curr)) return curr;
        return nextProjects[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const hasUnsavedAssignments = useMemo(
    () =>
      !assignmentMapsEqual(
        assignmentMap(assignmentRows),
        assignmentMap(savedAssignmentRows),
      ),
    [assignmentRows, savedAssignmentRows],
  );

  // Local draft mutators — placements persist when the instructor clicks Save.
  const applyAssignmentChange = useCallback(
    (
      targetUserId: string,
      newProjectId: string | null,
      newProjectName: string | null,
    ) => {
      let oldProjectId: string | null = null;
      setAssignmentRows((rows) =>
        rows.map((row) => {
          if (row.user_id !== targetUserId) return row;
          oldProjectId = row.assigned_project_id;
          return {
            ...row,
            assigned_project_id: newProjectId,
            assigned_project_name: newProjectName,
            role: newProjectId ? row.role ?? 'member' : null,
          };
        }),
      );
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id === oldProjectId && oldProjectId !== newProjectId) {
            return { ...p, seatsTaken: Math.max(p.seatsTaken - 1, 0) };
          }
          if (p.id === newProjectId && oldProjectId !== newProjectId) {
            return { ...p, seatsTaken: p.seatsTaken + 1 };
          }
          return p;
        }),
      );
    },
    [],
  );

  const projectsById = useMemo(() => {
    const map = new Map<string, AssignProject>();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const students = useMemo(
    () =>
      studentRows.map((row) => toStudent(row, focusedProjectId, projectsById)),
    [studentRows, focusedProjectId, projectsById],
  );

  const focusedProject = focusedProjectId
    ? projectsById.get(focusedProjectId) ?? null
    : null;

  const assignments = useMemo(
    () => buildAssignments(projects, assignmentRows),
    [projects, assignmentRows],
  );

  const assignedStudentIds = useMemo(() => {
    const set = new Set<string>();
    assignmentRows.forEach((row) => {
      if (row.assigned_project_id) set.add(row.user_id);
    });
    return set;
  }, [assignmentRows]);

  // student id → full work-with cluster (alphabetically first member is leader).
  const groupByStudentId = useMemo(() => {
    const { leaderIds, nestedByLeaderId } = buildWorkWithGroups(students);
    const map = new Map<string, Student[]>();
    for (const leaderId of leaderIds) {
      const nestedIds = nestedByLeaderId.get(leaderId) ?? [];
      const group = [leaderId, ...nestedIds]
        .map((id) => students.find((s) => s.id === id))
        .filter((s): s is Student => Boolean(s))
        .sort(compareStudentDisplayName);
      if (group.length < 2) continue;
      group.forEach((member) => map.set(member.id, group));
    }
    return map;
  }, [students]);

  const studentProjectMap = useMemo(() => {
    const map = new Map<string, AssignProject>();
    assignmentRows.forEach((row) => {
      if (!row.assigned_project_id) return;
      const project = projectsById.get(row.assigned_project_id);
      if (project) map.set(row.user_id, project);
    });
    return map;
  }, [assignmentRows, projectsById]);

  const availableSeats = useMemo(
    () =>
      projects.reduce(
        (sum, p) => sum + Math.max(p.totalSeats - p.seatsTaken, 0),
        0,
      ),
    [projects],
  );

  const projectsRemaining = useMemo(
    () => projects.filter((p) => p.seatsTaken < p.totalSeats).length,
    [projects],
  );

  const studentsUnassigned = students.length - assignedStudentIds.size;

  // ── Seat controls (optimistic) ─────────────────────────────────
  const handleAddSeat = async () => {
    if (!focusedProject) return;
    const projectId = focusedProject.id;
    const newTotal = focusedProject.totalSeats + 1;
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, totalSeats: newTotal } : p)),
    );
    try {
      await api.updateProject(projectId, { team_size: newTotal });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add seat');
      void refresh();
    }
  };

  const handleRemoveSeat = async () => {
    if (!focusedProject) return;
    if (focusedProject.totalSeats <= 0) return;
    if (focusedProject.totalSeats - 1 < focusedProject.seatsTaken) return;
    const projectId = focusedProject.id;
    const newTotal = Math.max(focusedProject.totalSeats - 1, 0);
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, totalSeats: newTotal } : p)),
    );
    try {
      await api.updateProject(projectId, { team_size: newTotal });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove seat');
      void refresh();
    }
  };

  // ── Drag & drop / quick-add (local draft until Save) ───────────
  const handleAssign = (
    projectId: string,
    _slotIndex: number,
    studentId: string,
  ) => {
    const targetSlots = assignments[projectId] ?? [];
    if (targetSlots.includes(studentId)) return;
    const targetProject = projectsById.get(projectId);
    setSaveMessage(null);
    applyAssignmentChange(
      studentId,
      projectId,
      targetProject?.name ?? null,
    );
  };

  const handleUnassign = (projectId: string, slotIndex: number) => {
    const studentId = assignments[projectId]?.[slotIndex];
    if (!studentId) return;
    setSaveMessage(null);
    applyAssignmentChange(studentId, null, null);
  };

  const handleAssignToFirstEmpty = (studentId: string) => {
    if (!focusedProject) return;
    const slots = assignments[focusedProject.id] ?? [];
    if (slots.includes(studentId)) return;
    if (slots.findIndex((s) => s === null) === -1) return;
    handleAssign(focusedProject.id, 0, studentId);
  };

  const handleReturnStudent = (studentId: string) => {
    if (!assignedStudentIds.has(studentId)) return;
    setSaveMessage(null);
    applyAssignmentChange(studentId, null, null);
  };

  const handleSaveAssignments = async () => {
    if (!classId) return;
    setSaving(true);
    setError(null);
    setSaveMessage(null);
    const current = assignmentMap(assignmentRows);
    const saved = assignmentMap(savedAssignmentRows);
    const dirty = !assignmentMapsEqual(current, saved);
    try {
      for (const [userId, projectId] of current) {
        const previous = saved.get(userId) ?? null;
        if (projectId === previous) continue;
        if (projectId) {
          await api.staffingAssign(classId, userId, projectId);
        } else if (previous) {
          await api.staffingUnassign(classId, userId);
        }
      }
      setSavedAssignmentRows(cloneAssignmentRows(assignmentRows));
      setSaveMessage(
        dirty
          ? 'Assignments saved and applied.'
          : 'Assignments are already up to date with the server.',
      );
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save assignments',
      );
      await refresh(false);
    } finally {
      setSaving(false);
    }
  };

  if (!selectedClass) {
    return (
      <div className="assign-page">
        <p>Select a class from the sidebar to assign projects.</p>
      </div>
    );
  }

  return (
    <div className="assign-page">
      <div className="assign-page__header">
        <button
          type="button"
          className="assign-page__back-btn"
          onClick={() => navigate('/app/staff-projects')}
        >
          <ArrowLeft size={15} />
          Back to Staffing
        </button>
        <button
          type="button"
          className="assign-page__save-btn"
          onClick={() => void handleSaveAssignments()}
          disabled={saving || loading}
          title="Apply all project placements to the class"
        >
          <Save size={16} />
          {saving ? 'Saving…' : 'Save assignments'}
        </button>
      </div>

      {error && <p className="assign-page__error">{error}</p>}
      {saveMessage && !error && (
        <p className="assign-page__save-message">{saveMessage}</p>
      )}
      {hasUnsavedAssignments && !saving && !error && (
        <p className="assign-page__draft-hint">
          You have unsaved placements. Click Save assignments to apply them.
        </p>
      )}

      <AssignSummaryBar
        summary={{
          studentsUnassigned,
          availableSeats,
          projectsRemaining,
          projectsTotal: projects.length,
        }}
      />

      {loading ? (
        <div className="assign-page__columns" aria-busy="true">
          {[0, 1].map((col) => (
            <div
              key={col}
              style={{
                border: '1px solid var(--gt-border)',
                borderRadius: 'var(--gt-radius-md)',
                background: 'var(--gt-surface)',
                padding: 'var(--gt-space-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--gt-space-sm)',
              }}
            >
              <Skeleton width="50%" height={16} />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Skeleton circle height={28} />
                  <Skeleton width="55%" height={13} />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="assign-page__columns">
          <StudentsPanel
            students={students}
            assignedStudentIds={assignedStudentIds}
            studentProjectMap={studentProjectMap}
            groupByStudentId={groupByStudentId}
            focusedProjectHasOpenSeat={
              focusedProject
                ? focusedProject.seatsTaken < focusedProject.totalSeats
                : false
            }
            onReturnStudent={handleReturnStudent}
            onQuickAdd={handleAssignToFirstEmpty}
          />
          <ProjectAssignmentPanel
            projects={projects}
            students={students}
            groupByStudentId={groupByStudentId}
            focusedProject={focusedProject}
            slotAssignments={
              focusedProject ? assignments[focusedProject.id] ?? [] : []
            }
            onSelectProject={(p) => setFocusedProjectId(p.id)}
            onAddSeat={handleAddSeat}
            onRemoveSeat={handleRemoveSeat}
            onAssignStudent={handleAssign}
            onAssignToFirstEmpty={handleAssignToFirstEmpty}
            onUnassignStudent={handleUnassign}
          />
        </div>
      )}
    </div>
  );
};

export default Assign;

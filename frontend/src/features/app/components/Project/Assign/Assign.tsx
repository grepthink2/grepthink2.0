import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);

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

  // Local optimistic mutators ─────────────────────────────────────
  // After a successful assign/unassign/seat change we update the
  // in-memory state immediately so the UI feels instant. The backend
  // is called in the background; if it fails we surface the error and
  // re-fetch to reconcile. ``num_staff`` (a.k.a. ``seatsTaken``) is the
  // only project metric that depends on assignments — breadth/depth/
  // strength are derived from interest_form rows, which don't change
  // on assign — so we don't need a server roundtrip to keep them
  // accurate.
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

  // student id → all group members (including the student themselves).
  // Built from each leader's `teammateIds` list.
  const groupByStudentId = useMemo(() => {
    const map = new Map<string, Student[]>();
    students.forEach((leader) => {
      if (!leader.teammateIds?.length) return;
      const group: Student[] = [
        leader,
        ...leader.teammateIds
          .map((id) => students.find((s) => s.id === id))
          .filter((s): s is Student => Boolean(s)),
      ];
      group.forEach((member) => map.set(member.id, group));
    });
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

  // ── Drag & drop / quick-add (optimistic) ───────────────────────
  // The backend's POST /assign already removes the student from any
  // existing project for this class, so the slotIndex is presentation-
  // only. We update local state first for instant feedback, then fire
  // the request; on failure we re-fetch to reconcile.
  const handleAssign = async (
    projectId: string,
    _slotIndex: number,
    studentId: string,
  ) => {
    if (!classId) return;
    const targetSlots = assignments[projectId] ?? [];
    if (targetSlots.includes(studentId)) return; // already there
    const targetProject = projectsById.get(projectId);
    applyAssignmentChange(
      studentId,
      projectId,
      targetProject?.name ?? null,
    );
    try {
      await api.staffingAssign(classId, studentId, projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign student');
      void refresh();
    }
  };

  const handleUnassign = async (projectId: string, slotIndex: number) => {
    if (!classId) return;
    const studentId = assignments[projectId]?.[slotIndex];
    if (!studentId) return;
    applyAssignmentChange(studentId, null, null);
    try {
      await api.staffingUnassign(classId, studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unassign student');
      void refresh();
    }
  };

  const handleAssignToFirstEmpty = async (studentId: string) => {
    if (!focusedProject) return;
    const slots = assignments[focusedProject.id] ?? [];
    if (slots.includes(studentId)) return;
    if (slots.findIndex((s) => s === null) === -1) return;
    await handleAssign(focusedProject.id, 0, studentId);
  };

  const handleReturnStudent = async (studentId: string) => {
    if (!classId) return;
    if (!assignedStudentIds.has(studentId)) return;
    applyAssignmentChange(studentId, null, null);
    try {
      await api.staffingUnassign(classId, studentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unassign student');
      void refresh();
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
          className="assign-page__back-btn"
          onClick={() => navigate('/app/staff-projects')}
        >
          <ArrowLeft size={15} />
          Back to Staffing
        </button>
      </div>

      {error && <p className="assign-page__error">{error}</p>}

      <AssignSummaryBar
        summary={{
          studentsUnassigned,
          availableSeats,
          projectsRemaining,
          projectsTotal: projects.length,
        }}
      />

      {loading ? (
        <p>Loading staffing data…</p>
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

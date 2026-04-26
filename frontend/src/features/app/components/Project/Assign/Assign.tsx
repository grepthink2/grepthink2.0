import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AssignSummaryBar from './AssignSummaryBar';
import StudentsPanel from './StudentsPanel';
import ProjectAssignmentPanel from './ProjectAssignmentPanel';
import type { AssignProject, Student } from './assignTypes';
import { MOCK_PROJECTS, MOCK_STUDENTS } from './assignMockData';
import './Assign.scss';

type Assignments = Record<string, (string | null)[]>;

const Assign: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<AssignProject[]>(MOCK_PROJECTS);
  const [assignments, setAssignments] = useState<Assignments>(() => {
    const initial: Assignments = {};
    MOCK_PROJECTS.forEach((p) => {
      initial[p.id] = Array.from({ length: p.totalSeats }, () => null);
    });
    return initial;
  });
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(
    MOCK_PROJECTS[0]?.id ?? null,
  );

  // Each project's live seatsTaken is derived from assignments.
  const hydratedProjects = useMemo<AssignProject[]>(
    () =>
      projects.map((p) => ({
        ...p,
        seatsTaken: (assignments[p.id] ?? []).filter(Boolean).length,
      })),
    [projects, assignments],
  );

  const focusedProject =
    hydratedProjects.find((p) => p.id === focusedProjectId) ?? null;

  const assignedStudentIds = useMemo(() => {
    const set = new Set<string>();
    Object.values(assignments).forEach((slots) =>
      slots.forEach((id) => {
        if (id) set.add(id);
      }),
    );
    return set;
  }, [assignments]);

  // student id → all group members (including the student themselves).
  // Built from each leader's `teammateIds` list.
  const groupByStudentId = useMemo(() => {
    const map = new Map<string, Student[]>();
    MOCK_STUDENTS.forEach((leader) => {
      if (!leader.teammateIds?.length) return;
      const group: Student[] = [
        leader,
        ...leader.teammateIds
          .map((id) => MOCK_STUDENTS.find((s) => s.id === id))
          .filter((s): s is Student => Boolean(s)),
      ];
      group.forEach((member) => map.set(member.id, group));
    });
    return map;
  }, []);

  // student id → the project they're currently assigned to (if any).
  const studentProjectMap = useMemo(() => {
    const map = new Map<string, AssignProject>();
    Object.entries(assignments).forEach(([projectId, slots]) => {
      const project = hydratedProjects.find((p) => p.id === projectId);
      if (!project) return;
      slots.forEach((studentId) => {
        if (studentId) map.set(studentId, project);
      });
    });
    return map;
  }, [assignments, hydratedProjects]);

  const availableSeats = useMemo(
    () =>
      hydratedProjects.reduce(
        (sum, p) => sum + Math.max(p.totalSeats - p.seatsTaken, 0),
        0,
      ),
    [hydratedProjects],
  );

  const projectsRemaining = useMemo(
    () => hydratedProjects.filter((p) => p.seatsTaken < p.totalSeats).length,
    [hydratedProjects],
  );

  const studentsUnassigned = MOCK_STUDENTS.length - assignedStudentIds.size;

  // ── Seat controls ──────────────────────────────────────────────
  const handleAddSeat = () => {
    if (!focusedProject) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === focusedProject.id ? { ...p, totalSeats: p.totalSeats + 1 } : p,
      ),
    );
    setAssignments((prev) => ({
      ...prev,
      [focusedProject.id]: [...(prev[focusedProject.id] ?? []), null],
    }));
  };

  const handleRemoveSeat = () => {
    if (!focusedProject) return;
    const slots = assignments[focusedProject.id] ?? [];
    // Remove the last empty slot; never drop a slot with an assigned student.
    const lastEmptyIdx = [...slots].reverse().findIndex((s) => s === null);
    if (lastEmptyIdx === -1) return;
    const removeIdx = slots.length - 1 - lastEmptyIdx;

    setProjects((prev) =>
      prev.map((p) =>
        p.id === focusedProject.id
          ? { ...p, totalSeats: Math.max(p.totalSeats - 1, 0) }
          : p,
      ),
    );
    setAssignments((prev) => ({
      ...prev,
      [focusedProject.id]: prev[focusedProject.id].filter(
        (_, i) => i !== removeIdx,
      ),
    }));
  };

  // ── Drag & drop ────────────────────────────────────────────────
  const handleAssign = (
    projectId: string,
    slotIndex: number,
    studentId: string,
  ) => {
    setAssignments((prev) => {
      const next: Assignments = {};
      // Remove the student from any existing slot first.
      Object.entries(prev).forEach(([pid, slots]) => {
        next[pid] = slots.map((s) => (s === studentId ? null : s));
      });
      const targetSlots = [...(next[projectId] ?? [])];
      if (targetSlots[slotIndex] !== null && targetSlots[slotIndex] !== undefined) {
        // Slot already occupied — abort (user must unassign first).
        return prev;
      }
      targetSlots[slotIndex] = studentId;
      next[projectId] = targetSlots;
      return next;
    });
  };

  const handleUnassign = (projectId: string, slotIndex: number) => {
    setAssignments((prev) => {
      const slots = [...(prev[projectId] ?? [])];
      slots[slotIndex] = null;
      return { ...prev, [projectId]: slots };
    });
  };

  /** Place a student into the focused project's first open seat (section-level drop). */
  const handleAssignToFirstEmpty = (studentId: string) => {
    if (!focusedProject) return;
    const slots = assignments[focusedProject.id] ?? [];
    if (slots.includes(studentId)) return; // already here — no-op
    const emptyIdx = slots.findIndex((s) => s === null);
    if (emptyIdx === -1) return; // full
    handleAssign(focusedProject.id, emptyIdx, studentId);
  };

  /** Remove a student from whichever slot they're currently in (across any project). */
  const handleReturnStudent = (studentId: string) => {
    if (!assignedStudentIds.has(studentId)) return;
    setAssignments((prev) => {
      const next: Record<string, (string | null)[]> = {};
      Object.entries(prev).forEach(([pid, slots]) => {
        next[pid] = slots.map((s) => (s === studentId ? null : s));
      });
      return next;
    });
  };

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

      <AssignSummaryBar
        summary={{
          studentsUnassigned,
          availableSeats,
          projectsRemaining,
          projectsTotal: hydratedProjects.length,
        }}
      />

      <div className="assign-page__columns">
        <StudentsPanel
          students={MOCK_STUDENTS}
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
          projects={hydratedProjects}
          students={MOCK_STUDENTS}
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
    </div>
  );
};

export default Assign;

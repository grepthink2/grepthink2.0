import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap, Plus, X, UserMinus, Search } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { ApiClassTA, ApiProject, ApiStudent } from '@/lib/api';
import './TAManagement.scss';

function studentName(s: ApiStudent): string {
  const full = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
  return full || s.email || 'Unknown';
}

const TAManagement: React.FC = () => {
  const { selectedClass } = useClass();
  const [students, setStudents] = useState<ApiStudent[]>([]);
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [tas, setTas] = useState<ApiClassTA[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Per-TA selected project in the "assign to project" dropdown.
  const [assignSelections, setAssignSelections] = useState<Record<string, string>>({});

  const load = useCallback(async (classId: string) => {
    setLoading(true);
    setError(null);
    try {
      const [studentsRes, projectsRes, tasRes] = await Promise.all([
        api.getClassStudents(classId),
        api.getClassProjects(classId),
        api.getClassTAs(classId),
      ]);
      setStudents(studentsRes.students ?? []);
      setProjects(projectsRes.projects ?? []);
      setTas(tasRes.tas ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load TA data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedClass?.id) {
      setStudents([]);
      setProjects([]);
      setTas([]);
      return;
    }
    void load(selectedClass.id);
  }, [selectedClass?.id, load]);

  const taIds = useMemo(() => new Set(tas.map((t) => t.id)), [tas]);

  // Registered students who are not already TAs, matching the search query.
  const eligibleStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => s.role !== 'instructor' && !taIds.has(s.id))
      .filter((s) => {
        if (!q) return true;
        return (
          studentName(s).toLowerCase().includes(q) ||
          (s.email ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => studentName(a).localeCompare(studentName(b)));
  }, [students, taIds, search]);

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    if (!selectedClass?.id) return;
    setBusyId(id);
    setActionError(null);
    try {
      await fn();
      await load(selectedClass.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const handlePromote = (student: ApiStudent) =>
    runAction(student.id, () => api.promoteToTA(selectedClass!.id, student.id));

  const handleDemote = (ta: ApiClassTA) => {
    if (!window.confirm(`Remove ${ta.name} as a TA for this class?`)) return;
    void runAction(ta.id, () => api.demoteTA(selectedClass!.id, ta.id));
  };

  const handleAssign = (ta: ApiClassTA) => {
    const projectId = assignSelections[ta.id];
    if (!projectId) return;
    void runAction(ta.id, async () => {
      await api.assignTAToProject(projectId, ta.id);
      setAssignSelections((prev) => ({ ...prev, [ta.id]: '' }));
    });
  };

  const handleUnassign = (ta: ApiClassTA, projectId: string) =>
    runAction(ta.id, () => api.removeTAFromProject(projectId, ta.id));

  if (!selectedClass) {
    return (
      <div className="ta-management">
        <div className="ta-management__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to manage TAs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ta-management">
      <header className="ta-management__intro">
        <h2>Teaching Assistants</h2>
        <p>
          Promote enrolled students to TAs and assign them to the projects they
          oversee. TAs can review the TSRs of their assigned projects and never
          count as project members.
        </p>
      </header>

      {(error || actionError) && (
        <div className="ta-management__error" role="alert">
          {error ?? actionError}
        </div>
      )}

      <div className="ta-management__layout">
        {/* Current TAs */}
        <section className="ta-management__panel">
          <div className="ta-management__panel-header">
            <h3>
              <GraduationCap size={18} /> Current TAs
              <span className="ta-management__count">{tas.length}</span>
            </h3>
          </div>

          {loading ? (
            <p className="ta-management__hint">Loading…</p>
          ) : tas.length === 0 ? (
            <p className="ta-management__hint">
              No TAs yet. Promote a student from the list on the right.
            </p>
          ) : (
            <ul className="ta-management__list">
              {tas.map((ta) => (
                <li key={ta.id} className="ta-card">
                  <div className="ta-card__top">
                    <div className="ta-card__identity">
                      <span className="ta-card__name">{ta.name}</span>
                      {ta.email && <span className="ta-card__email">{ta.email}</span>}
                    </div>
                    <button
                      type="button"
                      className="ta-card__demote"
                      onClick={() => handleDemote(ta)}
                      disabled={busyId === ta.id}
                    >
                      <UserMinus size={15} /> Remove TA
                    </button>
                  </div>

                  <div className="ta-card__projects">
                    {ta.projects.length === 0 ? (
                      <span className="ta-card__no-projects">No assigned projects</span>
                    ) : (
                      ta.projects.map((p) => (
                        <span key={p.id} className="ta-chip">
                          {p.name ?? 'Project'}
                          <button
                            type="button"
                            aria-label={`Unassign from ${p.name ?? 'project'}`}
                            onClick={() => handleUnassign(ta, p.id)}
                            disabled={busyId === ta.id}
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))
                    )}
                  </div>

                  <div className="ta-card__assign">
                    <select
                      value={assignSelections[ta.id] ?? ''}
                      onChange={(e) =>
                        setAssignSelections((prev) => ({ ...prev, [ta.id]: e.target.value }))
                      }
                      disabled={busyId === ta.id || projects.length === 0}
                    >
                      <option value="">Assign to project…</option>
                      {projects
                        .filter((p) => !ta.projects.some((ap) => ap.id === p.id))
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="ta-card__assign-btn"
                      onClick={() => handleAssign(ta)}
                      disabled={busyId === ta.id || !assignSelections[ta.id]}
                    >
                      <Plus size={15} /> Assign
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Eligible students */}
        <section className="ta-management__panel">
          <div className="ta-management__panel-header">
            <h3>Students</h3>
            <div className="ta-management__search">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search students"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <p className="ta-management__hint">Loading…</p>
          ) : eligibleStudents.length === 0 ? (
            <p className="ta-management__hint">No eligible students found.</p>
          ) : (
            <ul className="ta-management__list">
              {eligibleStudents.map((s) => (
                <li key={s.id} className="student-row">
                  <div className="student-row__identity">
                    <span className="student-row__name">{studentName(s)}</span>
                    {s.email && <span className="student-row__email">{s.email}</span>}
                  </div>
                  <button
                    type="button"
                    className="student-row__promote"
                    onClick={() => handlePromote(s)}
                    disabled={busyId === s.id}
                  >
                    <GraduationCap size={15} /> Make TA
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default TAManagement;

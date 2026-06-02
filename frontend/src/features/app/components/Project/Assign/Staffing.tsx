import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';
import type { ApiStaffingProjectRank } from '@/lib/api';
import AssignSummaryBar from './AssignSummaryBar';
import StaffingTable from './StaffingTable';
import type { RankedStaffingProject } from './assignTypes';
import './Staffing.scss';

/**
 * Adapt the backend's project-rank shape (which already carries breadth /
 * depth / strength + ranks) to the frontend's RankedStaffingProject shape.
 */
function toRankedStaffingProject(row: ApiStaffingProjectRank): RankedStaffingProject {
  return {
    id:         row.project_id,
    name:       row.project_name ?? 'Untitled project',
    sponsor:    '',
    popularity: row.strength,
    seatsTaken: row.num_staff,
    totalSeats: row.team_size,
    breadth:    row.breadth,
    depth:      row.depth,
    strength:   row.strength,
    bRank:      row.breadth_rank,
    dRank:      row.depth_rank,
    sRank:      row.strength_rank,
    sumRanks:   row.sum_of_ranks,
    totalRank:  row.total_rank,
  };
}

const Staffing: React.FC = () => {
  const navigate = useNavigate();
  const { selectedClass } = useClass();
  const classId = selectedClass?.id ?? null;

  const [rankedProjects, setRankedProjects] = useState<RankedStaffingProject[]>([]);
  const [unassignedCount, setUnassignedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!classId) {
      setRankedProjects([]);
      setUnassignedCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [rankRes, assignRes] = await Promise.all([
        api.getStaffingProjectRank(classId),
        api.getStaffingAssignments(classId),
      ]);
      setRankedProjects(rankRes.projects.map(toRankedStaffingProject));
      setUnassignedCount(
        assignRes.assignments.filter((a) => !a.assigned_project_id).length,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staffing data');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalSeats = useMemo(
    () => rankedProjects.reduce((sum, p) => sum + p.totalSeats, 0),
    [rankedProjects],
  );

  const projectsWithSeats = useMemo(
    () =>
      rankedProjects.filter((p) => p.totalSeats - p.seatsTaken > 0).length,
    [rankedProjects],
  );

  // The PATCH /api/projects/:id endpoint already supports updating
  // team_size; we use that to drive the seats stepper. team_size only
  // affects ``totalSeats`` / availability — breadth/depth/strength are
  // derived from interest_form rows and don't change here, so we update
  // local state optimistically and skip the round-trip refresh. On error
  // we re-fetch to reconcile.
  const handleAddSeat = async (projectId: string) => {
    const target = rankedProjects.find((p) => p.id === projectId);
    if (!target) return;
    const newTotal = target.totalSeats + 1;
    setRankedProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, totalSeats: newTotal } : p)),
    );
    try {
      await api.updateProject(projectId, { team_size: newTotal });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add seat');
      void refresh();
    }
  };

  const handleRemoveSeat = async (projectId: string) => {
    const target = rankedProjects.find((p) => p.id === projectId);
    if (!target || target.totalSeats <= 0) return;
    // Don't let the seat count drop below the number of currently
    // staffed members — the backend would still accept it, but the UI
    // would render a negative availability that's confusing.
    if (target.totalSeats - 1 < target.seatsTaken) return;
    const newTotal = Math.max(target.totalSeats - 1, 0);
    setRankedProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, totalSeats: newTotal } : p)),
    );
    try {
      await api.updateProject(projectId, { team_size: newTotal });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove seat');
      void refresh();
    }
  };

  if (!selectedClass) {
    return (
      <div className="staffing-page">
        <p>Select a class from the sidebar to staff projects.</p>
      </div>
    );
  }

  return (
    <div className="staffing-page">
      <div className="staffing-page__header">
        <div className="staffing-page__title-group">
          <h2 className="staffing-page__title">Project Staffing</h2>
          <p className="staffing-page__subtitle">
            Set the number of seats for each project before assigning students.
          </p>
        </div>
        <button
          className="staffing-page__continue-btn"
          onClick={() => navigate('/app/assign-projects')}
        >
          Continue to Assign
          <ArrowRight size={16} />
        </button>
      </div>

      <AssignSummaryBar
        summary={{
          studentsUnassigned: unassignedCount,
          availableSeats: totalSeats,
          projectsRemaining: projectsWithSeats,
          projectsTotal: rankedProjects.length,
        }}
      />

      {loading ? (
        <p>Loading project rankings…</p>
      ) : error ? (
        <p className="staffing-page__error">{error}</p>
      ) : (
        <StaffingTable
          projects={rankedProjects}
          onAddSeat={handleAddSeat}
          onRemoveSeat={handleRemoveSeat}
        />
      )}
    </div>
  );
};

export default Staffing;

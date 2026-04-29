import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AssignSummaryBar from './AssignSummaryBar';
import StaffingTable from './StaffingTable';
import type { RankedStaffingProject, StaffingProject } from './assignTypes';
import { MOCK_STAFFING_PROJECTS, MOCK_STUDENTS } from './assignMockData';
import './Staffing.scss';

/**
 * Compute ranks for a set of StaffingProjects.
 * Rank 1 = best (highest breadth / depth / strength, lowest sumRanks).
 */
function rankProjects(projects: StaffingProject[]): RankedStaffingProject[] {
  if (projects.length === 0) return [];

  const withStrength = projects.map((p) => ({
    ...p,
    strength: p.breadth > 0 ? p.depth / p.breadth : 0,
  }));

  const rankDesc = (values: number[]): number[] => {
    const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const ranks = new Array<number>(values.length);
    indexed.forEach(({ i }, rank) => { ranks[i] = rank + 1; });
    return ranks;
  };

  const bRanks = rankDesc(withStrength.map((p) => p.breadth));
  const dRanks = rankDesc(withStrength.map((p) => p.depth));
  const sRanks = rankDesc(withStrength.map((p) => p.strength));

  const withPartialRanks = withStrength.map((p, i) => ({
    ...p,
    bRank: bRanks[i],
    dRank: dRanks[i],
    sRank: sRanks[i],
    sumRanks: bRanks[i] + dRanks[i] + sRanks[i],
  }));

  const totalRanks = rankDesc(withPartialRanks.map((p) => -p.sumRanks)); // lower sumRanks = better = rank 1

  return withPartialRanks.map((p, i) => ({ ...p, totalRank: totalRanks[i] }));
}

const Staffing: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<StaffingProject[]>(MOCK_STAFFING_PROJECTS);

  const rankedProjects = useMemo(() => rankProjects(projects), [projects]);

  const totalSeats = useMemo(
    () => projects.reduce((sum, p) => sum + p.totalSeats, 0),
    [projects],
  );

  const projectsWithSeats = useMemo(
    () => projects.filter((p) => p.totalSeats > 0).length,
    [projects],
  );

  const handleAddSeat = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, totalSeats: p.totalSeats + 1 } : p,
      ),
    );
  };

  const handleRemoveSeat = (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === projectId ? { ...p, totalSeats: Math.max(p.totalSeats - 1, 0) } : p,
      ),
    );
  };

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
          studentsUnassigned: MOCK_STUDENTS.length,
          availableSeats: totalSeats,
          projectsRemaining: projectsWithSeats,
          projectsTotal: projects.length,
        }}
      />

      <StaffingTable
        projects={rankedProjects}
        onAddSeat={handleAddSeat}
        onRemoveSeat={handleRemoveSeat}
      />
    </div>
  );
};

export default Staffing;

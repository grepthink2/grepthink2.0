import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import ProjectGrid, { type ProjectGridItem } from '@features/app/components/Project/ProjectGrid';
import './BrowseProjects.scss';

interface ClassProjectRow {
  id: string;
  name: string;
  team_size?: number | string;
}

function toGridItem(raw: ClassProjectRow, index: number): ProjectGridItem {
  let teamSize = 4;
  if (typeof raw.team_size === 'number' && !Number.isNaN(raw.team_size)) {
    teamSize = raw.team_size;
  } else if (typeof raw.team_size === 'string') {
    const parsed = parseInt(raw.team_size, 10);
    if (!Number.isNaN(parsed)) {
      teamSize = parsed;
    }
  }

  return {
    id: raw.id,
    name: raw.name,
    team_size: teamSize,
    status: index % 2 === 0 ? 'open' : 'closed',
  };
}

const MyProject: React.FC = () => {
  const { selectedClass } = useClass();
  const [gridProjects, setGridProjects] = useState<ProjectGridItem[]>([]);
  const [singleRedirectId, setSingleRedirectId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedClass) {
      setLoading(false);
      setGridProjects([]);
      setSingleRedirectId(null);
      setCount(0);
      setError(null);
      return;
    }

    let isMounted = true;

    const load = async () => {
      try {
        setLoading(true);
        const [{ projects: myMemberships }, { projects: classProjects }] = await Promise.all([
          api.getProjects(),
          api.getClassProjects(selectedClass.id),
        ]);
        if (!isMounted) return;

        const myIds = new Set(myMemberships.map((p) => p.id));
        const mineInClass = classProjects.filter((p) => myIds.has(p.id));
        setCount(mineInClass.length);

        if (mineInClass.length === 1) {
          setSingleRedirectId(mineInClass[0].id);
          setGridProjects([]);
        } else if (mineInClass.length > 1) {
          setSingleRedirectId(null);
          const rows: ClassProjectRow[] = mineInClass.map((p) => ({
            id: p.id,
            name: p.name,
            team_size: p.team_size,
          }));
          setGridProjects(rows.map((p, i) => toGridItem(p, i)));
        } else {
          setSingleRedirectId(null);
          setGridProjects([]);
        }
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load your projects');
        setGridProjects([]);
        setSingleRedirectId(null);
        setCount(0);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [selectedClass]);

  if (!selectedClass) {
    return (
      <div className="browse-projects">
        <div className="browse-projects__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to view your project.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="browse-projects">
        <div className="browse-projects__empty">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="browse-projects">
        <div className="browse-projects__empty">
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (singleRedirectId) {
    return <Navigate to={`/app/projects/${singleRedirectId}`} replace />;
  }

  if (count === 0) {
    return (
      <div className="browse-projects">
        <header className="browse-projects__header">
          <h2 className="browse-projects__title">My Project Count</h2>
          <span className="browse-projects__count-badge">0</span>
        </header>
        <div className="browse-projects__empty browse-projects__empty--stack">
          <h2 className="browse-projects__empty-title">You are not in any projects</h2>
          <p className="browse-projects__empty-text">
            Browse projects in this class and request to join a team.
          </p>
          <Link to="/app/browse-projects" className="browse-projects__cta">
            Browse projects
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="browse-projects">
      <header className="browse-projects__header">
        <h2 className="browse-projects__title">My Project Count</h2>
        <span className="browse-projects__count-badge">{count}</span>
      </header>
      <ProjectGrid projects={gridProjects} memberProjects />
    </div>
  );
};

export default MyProject;

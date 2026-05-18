import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useClass } from '@/lib/classContext';
import ProjectGrid, { type ProjectGridItem } from '@features/app/components/Project/ProjectGrid';
import './BrowseProjects.scss';

interface ApiProjectListItem {
  id: string;
  name: string;
  team_size?: number | string;
  member_count?: number;
}

function toGridItem(raw: ApiProjectListItem, index: number): ProjectGridItem {
  let teamSize = 4;
  if (typeof raw.team_size === 'number' && !isNaN(raw.team_size)) {
    teamSize = raw.team_size;
  } else if (typeof raw.team_size === 'string') {
    const parsed = parseInt(raw.team_size, 10);
    if (!isNaN(parsed)) {
      teamSize = parsed;
    }
  }

  return {
    id: raw.id,
    name: raw.name,
    team_size: teamSize,
    member_count: typeof raw.member_count === 'number' ? raw.member_count : undefined,
    status: index % 2 === 0 ? 'open' : 'closed',
  };
}

const BrowseProjects: React.FC = () => {
  const { selectedClass } = useClass();
  const [projects, setProjects] = useState<ProjectGridItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedClass) {
      setLoading(false);
      setProjects([]);
      setError(null);
      return;
    }

    let isMounted = true;

    const fetchProjects = async () => {
      try {
        setLoading(true);
        const response = await api.getClassProjects(selectedClass.id);
        if (!isMounted) return;
        const list = response.projects ?? [];
        const asListItems: ApiProjectListItem[] = list.map((p) => ({
          id: p.id,
          name: p.name,
          team_size: p.team_size,
          member_count: (p as ApiProjectListItem).member_count,
        }));
        setProjects(asListItems.map((p, i) => toGridItem(p, i)));
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch projects');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProjects();
    return () => { isMounted = false; };
  }, [selectedClass]);

  if (!selectedClass) {
    return (
      <div className="browse-projects">
        <div className="browse-projects__empty">
          <h2>No Class Selected</h2>
          <p>Please select a class from the sidebar to browse projects.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="browse-projects">
        <div className="browse-projects__empty"><p>Loading projects...</p></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="browse-projects">
        <div className="browse-projects__empty"><p>Error: {error}</p></div>
      </div>
    );
  }

  return (
    <div className="browse-projects">
      <header className="browse-projects__header">
        <h2 className="browse-projects__title">Project Count</h2>
        <span className="browse-projects__count-badge">{projects.length}</span>
      </header>
      <ProjectGrid projects={projects} />
    </div>
  );
};

export default BrowseProjects;

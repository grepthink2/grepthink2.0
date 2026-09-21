import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useClass, type Class } from '@/lib/classContext';
import ProjectGrid, { ProjectGridSkeleton, type ProjectGridItem } from '@features/app/components/Project/ProjectGrid';
import { toProjectGridItem } from '@features/app/components/Project/projectGridHelpers';
import './BrowseProjects.scss';

/** A completed load, and the class object it was made for. */
interface ClassProjectsLoad {
  forClass: Class;
  projects: ProjectGridItem[];
  error: string | null;
}

const BrowseProjects: React.FC = () => {
  const { selectedClass } = useClass();
  const [loaded, setLoaded] = useState<ClassProjectsLoad | null>(null);

  useEffect(() => {
    if (!selectedClass) return;

    let isMounted = true;

    const fetchProjects = async () => {
      try {
        const response = await api.getClassProjects(selectedClass.id);
        if (!isMounted) return;
        const list = (response.projects ?? []).slice().sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        );
        setLoaded({
          forClass: selectedClass,
          projects: list.map((p) =>
            toProjectGridItem({
              id: p.id,
              name: p.name,
              team_size: p.team_size,
              member_count: p.member_count,
              image_url: p.image_url,
            }),
          ),
          error: null,
        });
      } catch (err) {
        if (!isMounted) return;
        setLoaded({
          forClass: selectedClass,
          projects: [],
          error: err instanceof Error ? err.message : 'Failed to fetch projects',
        });
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

  // Until a load for this class lands, it is still loading.
  const current = loaded?.forClass === selectedClass ? loaded : null;

  if (!current) {
    return (
      <div className="browse-projects">
        <header className="browse-projects__header">
          <h2 className="browse-projects__title">Project Count</h2>
        </header>
        <ProjectGridSkeleton />
      </div>
    );
  }

  if (current.error) {
    return (
      <div className="browse-projects">
        <div className="browse-projects__empty"><p>Error: {current.error}</p></div>
      </div>
    );
  }

  return (
    <div className="browse-projects">
      <header className="browse-projects__header">
        <h2 className="browse-projects__title">Project Count</h2>
        <span className="browse-projects__count-badge">{current.projects.length}</span>
      </header>
      <ProjectGrid projects={current.projects} />
    </div>
  );
};

export default BrowseProjects;

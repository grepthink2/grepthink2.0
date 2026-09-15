import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { useClass, type Class } from '@/lib/classContext';
import { usePreview } from '@/lib/previewContext';
import ProjectGrid, { ProjectGridSkeleton, type ProjectGridItem } from '@features/app/components/Project/ProjectGrid';
import { toProjectGridItem } from '@features/app/components/Project/projectGridHelpers';
import './BrowseProjects.scss';

/** A completed load of the student's projects, and the class object it was made for. */
interface MyProjectsLoad {
  forClass: Class;
  count: number;
  /** Set when the student is on exactly one project, which the page redirects to. */
  singleRedirectId: string | null;
  gridProjects: ProjectGridItem[];
  error: string | null;
}

const MyProject: React.FC = () => {
  const { selectedClass } = useClass();
  const { isPreviewing, previewProjectId } = usePreview();
  const [loaded, setLoaded] = useState<MyProjectsLoad | null>(null);

  useEffect(() => {
    if (!selectedClass) return;

    let isMounted = true;

    const load = async () => {
      try {
        const [{ projects: myMemberships }, { projects: classProjects }] = await Promise.all([
          api.getProjects(),
          api.getClassProjects(selectedClass.id),
        ]);
        if (!isMounted) return;

        const myIds = new Set(myMemberships.map((p) => p.id));
        const mineInClass = classProjects.filter((p) => myIds.has(p.id));
        setLoaded({
          forClass: selectedClass,
          count: mineInClass.length,
          singleRedirectId: mineInClass.length === 1 ? mineInClass[0].id : null,
          gridProjects:
            mineInClass.length > 1
              ? mineInClass.map((p) =>
                  toProjectGridItem({
                    id: p.id,
                    name: p.name,
                    team_size: p.team_size,
                    member_count: p.member_count,
                    image_url: p.image_url,
                  }),
                )
              : [],
          error: null,
        });
      } catch (err) {
        if (!isMounted) return;
        setLoaded({
          forClass: selectedClass,
          count: 0,
          singleRedirectId: null,
          gridProjects: [],
          error: err instanceof Error ? err.message : 'Failed to load your projects',
        });
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [selectedClass]);

  // In "View as Student" preview bound to a project, treat it as the user's
  // project so this page mirrors a member's single-project experience.
  if (isPreviewing && previewProjectId) {
    return <Navigate to={`/app/projects/${previewProjectId}`} replace />;
  }

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

  // Until a load for this class lands, it is still loading.
  const current = loaded?.forClass === selectedClass ? loaded : null;

  if (!current) {
    return (
      <div className="browse-projects">
        <header className="browse-projects__header">
          <h2 className="browse-projects__title">My Project Count</h2>
        </header>
        <ProjectGridSkeleton count={3} />
      </div>
    );
  }

  if (current.error) {
    return (
      <div className="browse-projects">
        <div className="browse-projects__empty">
          <p>Error: {current.error}</p>
        </div>
      </div>
    );
  }

  if (current.singleRedirectId) {
    return <Navigate to={`/app/projects/${current.singleRedirectId}`} replace />;
  }

  if (current.count === 0) {
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
        <span className="browse-projects__count-badge">{current.count}</span>
      </header>
      <ProjectGrid projects={current.gridProjects} memberProjects />
    </div>
  );
};

export default MyProject;

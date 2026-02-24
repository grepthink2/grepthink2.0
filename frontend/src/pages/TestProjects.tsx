import React, { useEffect, useState } from 'react';
import { api, type ApiClass, type ApiProject, type ApiProjectJoinRequest } from '@/lib/api';
import './TestProjects.scss';

const TestProjects: React.FC = () => {
  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestingProjectId, setRequestingProjectId] = useState<string | null>(null);
  const [loadingJoinRequestsProjectId, setLoadingJoinRequestsProjectId] = useState<string | null>(null);
  const [joinRequestsByProject, setJoinRequestsByProject] = useState<Record<string, ApiProjectJoinRequest[]>>({});
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadClasses = async () => {
    setLoadingClasses(true);
    setError(null);
    try {
      const response = await api.getClasses();
      setClasses(response.classes);

      if (response.classes.length > 0) {
        setSelectedClassId((current) => current || response.classes[0].id);
      } else {
        setSelectedClassId('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classes');
    } finally {
      setLoadingClasses(false);
    }
  };

  const loadProjects = async (classId: string) => {
    if (!classId) {
      setProjects([]);
      return;
    }

    setLoadingProjects(true);
    setError(null);
    try {
      const response = await api.getProjects(classId);
      setProjects(response.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
      setProjects([]);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    void loadClasses();
  }, []);

  useEffect(() => {
    void loadProjects(selectedClassId);
  }, [selectedClassId]);

  const handleCreateProject = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!selectedClassId) {
      setError('Select a class first');
      return;
    }

    if (!projectName.trim()) {
      setError('Project name is required');
      return;
    }

    setSubmitting(true);
    try {
      await api.createProject({
        class_id: selectedClassId,
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
        team_size: 1,
      });

      setProjectName('');
      setProjectDescription('');
      setSuccess('Project created successfully');
      await loadProjects(selectedClassId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestJoin = async (projectId: string) => {
    setError(null);
    setSuccess(null);
    setRequestingProjectId(projectId);
    try {
      const response = await api.requestJoinProject(projectId);
      setSuccess(response.message || 'Join request submitted successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit join request');
    } finally {
      setRequestingProjectId(null);
    }
  };

  const loadJoinRequests = async (projectId: string) => {
    setError(null);
    setLoadingJoinRequestsProjectId(projectId);
    try {
      const response = await api.getProjectJoinRequests(projectId);
      setJoinRequestsByProject((current) => ({
        ...current,
        [projectId]: response.requests,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load join requests');
    } finally {
      setLoadingJoinRequestsProjectId(null);
    }
  };

  const handleReviewRequest = async (projectId: string, requestId: string, action: 'accept' | 'reject') => {
    setError(null);
    setSuccess(null);
    setReviewingRequestId(requestId);
    try {
      if (action === 'accept') {
        const response = await api.acceptProjectJoinRequest(requestId);
        setSuccess(response.message || 'Join request accepted successfully');
      } else {
        const response = await api.rejectProjectJoinRequest(requestId);
        setSuccess(response.message || 'Join request rejected successfully');
      }
      await loadJoinRequests(projectId);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} join request`);
    } finally {
      setReviewingRequestId(null);
    }
  };

  return (
    <div className="test-projects-page">
      <header className="test-projects-page__hero">
        <h1 className="test-projects-page__title">Project Lab</h1>
        <p className="test-projects-page__subtitle">
          Create a project as a student and verify it appears to the class.
        </p>
      </header>

      {error && <div className="test-projects-page__status test-projects-page__status--error">{error}</div>}
      {success && <div className="test-projects-page__status test-projects-page__status--success">{success}</div>}

      <section className="test-projects-page__card test-projects-page__controls">
        <h2 className="test-projects-page__section-title">Choose Class</h2>
        <label htmlFor="class-select" className="test-projects-page__label">Class</label>
        <div className="test-projects-page__control-row">
          <select
            id="class-select"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            disabled={loadingClasses || classes.length === 0}
          >
            {classes.length === 0 ? (
              <option value="">No classes found</option>
            ) : (
              classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))
            )}
          </select>
          <button type="button" onClick={() => void loadClasses()} disabled={loadingClasses}>
            {loadingClasses ? 'Loading...' : 'Reload Classes'}
          </button>
          <button type="button" onClick={() => void loadProjects(selectedClassId)} disabled={loadingProjects || !selectedClassId}>
            {loadingProjects ? 'Loading...' : 'Reload Projects'}
          </button>
        </div>
      </section>

      <form className="test-projects-page__card test-projects-page__form" onSubmit={handleCreateProject}>
        <h2 className="test-projects-page__section-title">Create Project</h2>
        <input
          type="text"
          placeholder="Project name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          disabled={submitting}
        />
        <textarea
          placeholder="Project description"
          value={projectDescription}
          onChange={(e) => setProjectDescription(e.target.value)}
          disabled={submitting}
          rows={4}
        />
        <button type="submit" disabled={submitting || !selectedClassId}>
          {submitting ? 'Creating...' : 'Create Project'}
        </button>
      </form>

      <section className="test-projects-page__card test-projects-page__list">
        <h2 className="test-projects-page__section-title">Class Projects</h2>
        {loadingProjects ? (
          <p>Loading projects...</p>
        ) : projects.length === 0 ? (
          <p>No projects in this class yet.</p>
        ) : (
          <ul>
            {projects.map((project) => (
              <li key={project.id}>
                <div className="test-projects-page__project-header">
                  <div className="test-projects-page__project-name">{project.name}</div>
                  <span className="test-projects-page__pill">Student Project</span>
                </div>
                <div className="test-projects-page__project-meta">By {project.creator_email || project.created_by}</div>
                {project.description && <p>{project.description}</p>}
                <div className="test-projects-page__actions">
                  <button
                    type="button"
                    onClick={() => void handleRequestJoin(project.id)}
                    disabled={requestingProjectId === project.id}
                  >
                    {requestingProjectId === project.id ? 'Sending...' : 'Request Join'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadJoinRequests(project.id)}
                    disabled={loadingJoinRequestsProjectId === project.id}
                  >
                    {loadingJoinRequestsProjectId === project.id ? 'Loading...' : 'View Join Requests'}
                  </button>
                </div>

                {Object.prototype.hasOwnProperty.call(joinRequestsByProject, project.id) && (
                  <div className="test-projects-page__join-requests">
                    {joinRequestsByProject[project.id].length === 0 ? (
                      <p>No pending join requests.</p>
                    ) : (
                      <ul>
                        {joinRequestsByProject[project.id].map((request) => (
                          <li key={request.request_id}>
                            <div>
                              <strong>{request.email || request.user_id}</strong>
                              <span> requested access</span>
                            </div>
                            <div className="test-projects-page__request-actions">
                              <button
                                type="button"
                                onClick={() => void handleReviewRequest(project.id, request.request_id, 'accept')}
                                disabled={reviewingRequestId === request.request_id}
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleReviewRequest(project.id, request.request_id, 'reject')}
                                disabled={reviewingRequestId === request.request_id}
                              >
                                Reject
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default TestProjects;

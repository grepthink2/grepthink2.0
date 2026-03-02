import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabaseClient';
import {
  api,
  type ApiClass,
  type ApiProject,
  type ApiProjectJoinRequest,
  type ApiProjectMember,
  type ApiTSR,
} from '@/lib/api';
import './TestProjects.scss';

interface SimulatedTeamMember {
  id: string;
  name: string;
  email: string;
}

interface TsrFormDraft {
  evaluateeId: string;
  percentContribution: string;
  positiveFeedback: string;
  constructiveFeedback: string;
  scrumMasterNotes: string;
}

const createEmptyTsrDraft = (): TsrFormDraft => ({
  evaluateeId: '',
  percentContribution: '',
  positiveFeedback: '',
  constructiveFeedback: '',
  scrumMasterNotes: '',
});

const getProjectOwnerMember = (project: ApiProject): SimulatedTeamMember => {
  const createdBy = project.created_by || 'unknown';
  const ownerEmail = project.creator_email || `${createdBy}@example.com`;
  const ownerName = ownerEmail.split('@')[0] || 'project-owner';
  return {
    id: createdBy,
    name: ownerName,
    email: ownerEmail,
  };
};

const mapApiMemberToTeamMember = (member: ApiProjectMember): SimulatedTeamMember => {
  const email = member.email || `${member.user_id}@example.com`;
  const name = email.split('@')[0] || 'member';
  return {
    id: member.user_id,
    name,
    email,
  };
};

const TestProjects: React.FC = () => {
  const location = useLocation();
  const isStudentFlow = location.pathname.includes('/test-115a-projects') || location.pathname.includes('/test-projects');

  const [classes, setClasses] = useState<ApiClass[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  // Sponsor fields
  const [sponsorName, setSponsorName] = useState('');
  const [sponsorCompany, setSponsorCompany] = useState('');
  const [sponsorEmail, setSponsorEmail] = useState('');
  const [sponsorWebsite, setSponsorWebsite] = useState('');
  const [sponsorDescription, setSponsorDescription] = useState('');
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestingProjectId, setRequestingProjectId] = useState<string | null>(null);
  const [loadingJoinRequestsProjectId, setLoadingJoinRequestsProjectId] = useState<string | null>(null);
  const [joinRequestsByProject, setJoinRequestsByProject] = useState<Record<string, ApiProjectJoinRequest[]>>({});
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);
  const [projectTeamMembers, setProjectTeamMembers] = useState<Record<string, SimulatedTeamMember[]>>({});
  const [loadingProjectMembersByProject, setLoadingProjectMembersByProject] = useState<Record<string, boolean>>({});
  const [projectMembersErrorByProject, setProjectMembersErrorByProject] = useState<Record<string, string | null>>({});
  const [projectTsrsByProject, setProjectTsrsByProject] = useState<Record<string, ApiTSR[]>>({});
  const [loadingProjectTsrsByProject, setLoadingProjectTsrsByProject] = useState<Record<string, boolean>>({});
  const [submittingTsrProjectId, setSubmittingTsrProjectId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [tsrDraftsByProject, setTsrDraftsByProject] = useState<Record<string, TsrFormDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [managingMembersProjectId, setManagingMembersProjectId] = useState<string | null>(null);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('member');
  const [addingMemberProjectId, setAddingMemberProjectId] = useState<string | null>(null);
  const [removingMemberProjectId, setRemovingMemberProjectId] = useState<Record<string, string | null>>({});
  const [editingMemberRole, setEditingMemberRole] = useState<Record<string, string | null>>({});
  const [projectMemberRoles, setProjectMemberRoles] = useState<Record<string, Record<string, string>>>({});

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
    const loadCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || '');
    };

    void loadCurrentUser();
  }, []);

  useEffect(() => {
    void loadProjects(selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    const activeProjectIds = new Set(projects.map((project) => project.id));

    setProjectTeamMembers((current) => {
      const next: Record<string, SimulatedTeamMember[]> = {};
      projects.forEach((project) => {
        const existing = current[project.id];
        next[project.id] = existing && existing.length > 0 ? existing : [];
      });
      return next;
    });

    setLoadingProjectMembersByProject((current) => {
      const next: Record<string, boolean> = {};
      Object.entries(current).forEach(([projectId, value]) => {
        if (activeProjectIds.has(projectId)) {
          next[projectId] = value;
        }
      });
      return next;
    });

    setProjectMembersErrorByProject((current) => {
      const next: Record<string, string | null> = {};
      Object.entries(current).forEach(([projectId, value]) => {
        if (activeProjectIds.has(projectId)) {
          next[projectId] = value;
        }
      });
      return next;
    });

    setTsrDraftsByProject((current) => {
      const next: Record<string, TsrFormDraft> = {};
      projects.forEach((project) => {
        next[project.id] = current[project.id] || createEmptyTsrDraft();
      });
      return next;
    });

    setProjectTsrsByProject((current) => {
      const next: Record<string, ApiTSR[]> = {};
      Object.entries(current).forEach(([projectId, entries]) => {
        if (activeProjectIds.has(projectId)) {
          next[projectId] = entries;
        }
      });
      return next;
    });

    setLoadingProjectTsrsByProject((current) => {
      const next: Record<string, boolean> = {};
      Object.entries(current).forEach(([projectId, value]) => {
        if (activeProjectIds.has(projectId)) {
          next[projectId] = value;
        }
      });
      return next;
    });
  }, [projects]);

  const loadProjectMembers = async (project: ApiProject) => {
    setLoadingProjectMembersByProject((current) => ({
      ...current,
      [project.id]: true,
    }));
    setProjectMembersErrorByProject((current) => ({
      ...current,
      [project.id]: null,
    }));

    try {
      const response = await api.getProjectMembers(project.id);
      const members = response.members.map(mapApiMemberToTeamMember);
      
      // Store member roles
      const rolesMap: Record<string, string> = {};
      response.members.forEach((member) => {
        rolesMap[member.user_id] = member.project_role;
      });
      setProjectMemberRoles((current) => ({
        ...current,
        [project.id]: rolesMap,
      }));

      setProjectTeamMembers((current) => ({
        ...current,
        [project.id]: members,
      }));
    } catch (err) {
      setProjectMembersErrorByProject((current) => ({
        ...current,
        [project.id]: err instanceof Error ? err.message : 'Failed to load project members',
      }));
      setProjectTeamMembers((current) => ({
        ...current,
        [project.id]: [],
      }));
    } finally {
      setLoadingProjectMembersByProject((current) => ({
        ...current,
        [project.id]: false,
      }));
    }
  };

  const loadProjectTsrs = async (projectId: string) => {
    setLoadingProjectTsrsByProject((current) => ({
      ...current,
      [projectId]: true,
    }));

    try {
      const response = await api.getProjectTsrs(projectId);
      setProjectTsrsByProject((current) => ({
        ...current,
        [projectId]: response.tsrs || [],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load TSRs');
    } finally {
      setLoadingProjectTsrsByProject((current) => ({
        ...current,
        [projectId]: false,
      }));
    }
  };

  const handleAddProjectMember = async (projectId: string) => {
    setError(null);
    setSuccess(null);

    if (!newMemberEmail.trim()) {
      setError('Please enter a member email or ID');
      return;
    }

    setAddingMemberProjectId(projectId);
    try {
      const response = await api.addProjectMember(projectId, newMemberEmail.trim(), newMemberRole);
      setSuccess(response.message || 'Member added successfully');
      setNewMemberEmail('');
      setNewMemberRole('member');

      const project = projects.find((p) => p.id === projectId);
      if (project) {
        await loadProjectMembers(project);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddingMemberProjectId(null);
    }
  };

  const handleRemoveProjectMember = async (projectId: string, memberId: string) => {
    setError(null);
    setSuccess(null);

    if (!window.confirm('Are you sure you want to remove this member from the project?')) {
      return;
    }

    setRemovingMemberProjectId((current) => ({
      ...current,
      [memberId]: projectId,
    }));

    try {
      const response = await api.removeProjectMember(projectId, memberId);
      setSuccess(response.message || 'Member removed successfully');

      const project = projects.find((p) => p.id === projectId);
      if (project) {
        await loadProjectMembers(project);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemovingMemberProjectId((current) => ({
        ...current,
        [memberId]: null,
      }));
    }
  };

  const handleUpdateMemberRole = async (projectId: string, memberId: string, newRole: string) => {
    setError(null);
    setSuccess(null);

    setEditingMemberRole((current) => ({
      ...current,
      [memberId]: projectId,
    }));

    try {
      const response = await api.updateProjectMemberRole(projectId, memberId, newRole);
      setSuccess(response.message || 'Member role updated successfully');

      const project = projects.find((p) => p.id === projectId);
      if (project) {
        await loadProjectMembers(project);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update member role');
    } finally {
      setEditingMemberRole((current) => ({
        ...current,
        [memberId]: null,
      }));
    }
  };

  useEffect(() => {
    if (projects.length === 0) {
      return;
    }

    projects.forEach((project) => {
      void loadProjectMembers(project);
      void loadProjectTsrs(project.id);
    });
  }, [projects]);

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
      const payload: Parameters<typeof api.testCreateProject>[0] = {
        class_id: selectedClassId,
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
        team_size: 4,
      };

      if (!isStudentFlow) {
        payload.sponsor_name = sponsorName.trim() || undefined;
        payload.sponsor_company = sponsorCompany.trim() || undefined;
        payload.sponsor_email = sponsorEmail.trim() || undefined;
        payload.sponsor_website = sponsorWebsite.trim() || undefined;
        payload.sponsor_description = sponsorDescription.trim() || undefined;
      }

      await api.testCreateProject(payload);

      setProjectName('');
      setProjectDescription('');
      setSponsorName('');
      setSponsorCompany('');
      setSponsorEmail('');
      setSponsorWebsite('');
      setSponsorDescription('');
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
        const acceptedProject = projects.find((project) => project.id === projectId);
        if (acceptedProject) {
          await loadProjectMembers(acceptedProject);
        }
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

  const handleTsrDraftChange = (
    projectId: string,
    field: keyof TsrFormDraft,
    value: string
  ) => {
    setTsrDraftsByProject((current) => {
      const draft = current[projectId] || createEmptyTsrDraft();
      const nextDraft: TsrFormDraft = {
        ...draft,
        [field]: value,
      };

      return {
        ...current,
        [projectId]: nextDraft,
      };
    });
  };

  const handleSubmitTsr = async (projectId: string) => {
    setError(null);
    setSuccess(null);

    const draft = tsrDraftsByProject[projectId] || createEmptyTsrDraft();
    const members = projectTeamMembers[projectId] || [];

    if (members.length < 2) {
      setError('Project needs at least 2 members for TSR reviews');
      return;
    }

    if (!draft.evaluateeId) {
      setError('Select an evaluatee');
      return;
    }

    if (!currentUserId) {
      setError('Missing current user session');
      return;
    }

    if (currentUserId === draft.evaluateeId) {
      setError('You cannot submit a TSR for yourself');
      return;
    }

    const contribution = Number(draft.percentContribution);
    if (Number.isNaN(contribution) || contribution < 0 || contribution > 100) {
      setError('Contribution must be a number between 0 and 100');
      return;
    }

    if (!draft.positiveFeedback.trim() || !draft.constructiveFeedback.trim()) {
      setError('Positive and constructive feedback are required');
      return;
    }

    setSubmittingTsrProjectId(projectId);
    try {
      await api.createProjectTsr(projectId, {
        evaluatee_id: draft.evaluateeId,
        percent_contribution: contribution,
        positive_feedback: draft.positiveFeedback.trim(),
        constructive_feedback: draft.constructiveFeedback.trim(),
        scrum_master_notes: draft.scrumMasterNotes.trim(),
      });

      setTsrDraftsByProject((current) => ({
        ...current,
        [projectId]: createEmptyTsrDraft(),
      }));

      await loadProjectTsrs(projectId);
      setSuccess('TSR submitted successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit TSR');
    } finally {
      setSubmittingTsrProjectId(null);
    }
  };

  const getMemberDisplay = (members: SimulatedTeamMember[], memberId: string) => {
    const member = members.find((item) => item.id === memberId);
    if (!member) {
      return 'Unknown member';
    }
    return `${member.name} (${member.email})`;
  };

  const handleViewSponsorDetails = async (projectId: string) => {
    setLoadingDetail(true);
    setSelectedProjectDetail(null);
    try {
      const res = await api.getProject(projectId);
      setSelectedProjectDetail(res.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project details');
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <div className="test-projects-page">
      <header className="test-projects-page__hero">
        <h1 className="test-projects-page__title">Project Lab</h1>
        <p className="test-projects-page__subtitle">
          Create projects as a student and verify sponsor + TSR workflows.
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
              classes.map((cls, idx) => (
                <option key={`${cls.id}-${idx}`} value={cls.id}>
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
        <h2 className="test-projects-page__section-title">
          {isStudentFlow ? 'Create Project (Student test flow)' : 'Create Project (Instructor test flow)'}
        </h2>
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

        {!isStudentFlow && (
          <>
            <h3 style={{ margin: '0.75rem 0 0.25rem', fontSize: '1rem' }}>Sponsor Information</h3>
            <input
              type="text"
              placeholder="Sponsor Contact Name"
              value={sponsorName}
              onChange={(e) => setSponsorName(e.target.value)}
              disabled={submitting}
            />
            <input
              type="text"
              placeholder="Company / Organization"
              value={sponsorCompany}
              onChange={(e) => setSponsorCompany(e.target.value)}
              disabled={submitting}
            />
            <input
              type="email"
              placeholder="Sponsor Email"
              value={sponsorEmail}
              onChange={(e) => setSponsorEmail(e.target.value)}
              disabled={submitting}
            />
            <input
              type="url"
              placeholder="Sponsor Website (https://...)"
              value={sponsorWebsite}
              onChange={(e) => setSponsorWebsite(e.target.value)}
              disabled={submitting}
            />
            <textarea
              placeholder="Brief description of the sponsor"
              value={sponsorDescription}
              onChange={(e) => setSponsorDescription(e.target.value)}
              disabled={submitting}
              rows={2}
            />
          </>
        )}

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
                  <span className="test-projects-page__pill">{isStudentFlow ? 'Student Project' : 'Instructor Project'}</span>
                </div>
                <div className="test-projects-page__project-meta">By {project.creator_email || project.created_by || 'Unknown'}</div>
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
                  <button
                    type="button"
                    onClick={() => void handleViewSponsorDetails(project.id)}
                    disabled={loadingDetail}
                    style={{ backgroundColor: '#4f46e5' }}
                  >
                    {loadingDetail && selectedProjectDetail === null ? 'Loading...' : 'View Full Details'}
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

                <div className="test-projects-page__tsr">
                  <h3 className="test-projects-page__subheading">TSR Simulator</h3>
                  <p className="test-projects-page__hint">
                    Team members are loaded from your project membership list.
                  </p>

                  <div className="test-projects-page__actions">
                    <button
                      type="button"
                      onClick={() => void loadProjectMembers(project)}
                      disabled={loadingProjectMembersByProject[project.id]}
                    >
                      {loadingProjectMembersByProject[project.id] ? 'Loading Members...' : 'Reload Team Members'}
                    </button>
                  </div>

                  {projectMembersErrorByProject[project.id] && (
                    <p className="test-projects-page__hint">{projectMembersErrorByProject[project.id]}</p>
                  )}

                  <div className="test-projects-page__members">
                    {(projectTeamMembers[project.id] || []).map((member) => (
                      <span key={member.id} className="test-projects-page__member-pill">
                        {member.name}
                      </span>
                    ))}
                  </div>

                  <div className="test-projects-page__member-management">
                    <h4 className="test-projects-page__subheading">Manage Members</h4>
                    
                    <div className="test-projects-page__add-member-form">
                      <input
                        type="text"
                        placeholder="Member email or ID"
                        value={newMemberEmail}
                        onChange={(e) => setNewMemberEmail(e.target.value)}
                        disabled={addingMemberProjectId === project.id}
                      />
                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value)}
                        disabled={addingMemberProjectId === project.id}
                      >
                        <option value="member">Member</option>
                        <option value="scrum master">Scrum Master</option>
                        <option value="product owner">Product Owner</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleAddProjectMember(project.id)}
                        disabled={addingMemberProjectId === project.id}
                      >
                        {addingMemberProjectId === project.id ? 'Adding...' : 'Add Member'}
                      </button>
                    </div>

                    <div className="test-projects-page__members-list">
                      {(projectTeamMembers[project.id] || []).length === 0 ? (
                        <p>No members in this project.</p>
                      ) : (
                        <ul>
                          {(projectTeamMembers[project.id] || []).map((member) => (
                            <li key={member.id} className="test-projects-page__member-item">
                              <div className="test-projects-page__member-info">
                                <strong>{member.name}</strong>
                                <span>{member.email}</span>
                              </div>
                              <div className="test-projects-page__member-actions">
                                <select
                                  value={projectMemberRoles[project.id]?.[member.id] || 'member'}
                                  onChange={(e) => void handleUpdateMemberRole(project.id, member.id, e.target.value)}
                                  disabled={editingMemberRole[member.id] === project.id}
                                >
                                  <option value="member">Member</option>
                                  <option value="scrum master">Scrum Master</option>
                                  <option value="product owner">Product Owner</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => void handleRemoveProjectMember(project.id, member.id)}
                                  disabled={removingMemberProjectId[member.id] === project.id}
                                  className="test-projects-page__btn-danger"
                                >
                                  {removingMemberProjectId[member.id] === project.id ? 'Removing...' : 'Remove'}
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="test-projects-page__tsr-form">
                    <div className="test-projects-page__tsr-row">
                      <div>
                        <label htmlFor={`evaluatee-${project.id}`} className="test-projects-page__label">
                          Evaluatee
                        </label>
                        <select
                          id={`evaluatee-${project.id}`}
                          value={tsrDraftsByProject[project.id]?.evaluateeId || ''}
                          onChange={(e) => handleTsrDraftChange(project.id, 'evaluateeId', e.target.value)}
                        >
                          <option value="">Select evaluatee</option>
                          {(projectTeamMembers[project.id] || [])
                            .filter((member) => member.id !== currentUserId)
                            .map((member, idx) => (
                              <option key={`${member.id}-${idx}`} value={member.id}>
                                {member.name} ({member.email})
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`contribution-${project.id}`} className="test-projects-page__label">
                          Contribution (%)
                        </label>
                        <input
                          id={`contribution-${project.id}`}
                          type="number"
                          min={0}
                          max={100}
                          placeholder="0-100"
                          value={tsrDraftsByProject[project.id]?.percentContribution || ''}
                          onChange={(e) => handleTsrDraftChange(project.id, 'percentContribution', e.target.value)}
                        />
                      </div>
                    </div>

                    <textarea
                      rows={3}
                      placeholder="Positive feedback"
                      value={tsrDraftsByProject[project.id]?.positiveFeedback || ''}
                      onChange={(e) => handleTsrDraftChange(project.id, 'positiveFeedback', e.target.value)}
                    />
                    <textarea
                      rows={3}
                      placeholder="Constructive feedback"
                      value={tsrDraftsByProject[project.id]?.constructiveFeedback || ''}
                      onChange={(e) => handleTsrDraftChange(project.id, 'constructiveFeedback', e.target.value)}
                    />
                    <textarea
                      rows={2}
                      placeholder="Scrum master notes (optional)"
                      value={tsrDraftsByProject[project.id]?.scrumMasterNotes || ''}
                      onChange={(e) => handleTsrDraftChange(project.id, 'scrumMasterNotes', e.target.value)}
                    />

                    <button
                      type="button"
                      onClick={() => void handleSubmitTsr(project.id)}
                      disabled={submittingTsrProjectId === project.id}
                    >
                      {submittingTsrProjectId === project.id ? 'Submitting...' : 'Submit TSR'}
                    </button>
                  </div>

                  <div className="test-projects-page__tsr-history">
                    <h4 className="test-projects-page__subheading">Submitted TSRs</h4>
                    <div className="test-projects-page__actions">
                      <button
                        type="button"
                        onClick={() => void loadProjectTsrs(project.id)}
                        disabled={loadingProjectTsrsByProject[project.id]}
                      >
                        {loadingProjectTsrsByProject[project.id] ? 'Loading TSRs...' : 'Reload TSRs'}
                      </button>
                    </div>
                    {(projectTsrsByProject[project.id] || []).length === 0 ? (
                      <p>No TSRs submitted yet for this project.</p>
                    ) : (
                      <ul>
                        {(projectTsrsByProject[project.id] || []).map((entry, index) => (
                          <li key={`${project.id}-tsr-${index}`}>
                            <div className="test-projects-page__tsr-meta">
                              <strong>{entry.email || getMemberDisplay(projectTeamMembers[project.id] || [], entry.evaluator_id || '')}</strong>
                              <span> reviewed </span>
                              <strong>{getMemberDisplay(projectTeamMembers[project.id] || [], entry.evaluatee_id || '')}</strong>
                              <span> ({entry.percent_contribution}%)</span>
                            </div>
                            <p><strong>Positive:</strong> {entry.positive_feedback}</p>
                            <p><strong>Constructive:</strong> {entry.constructive_feedback}</p>
                            {entry.scrum_master_notes && <p><strong>Scrum Notes:</strong> {entry.scrum_master_notes}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {selectedProjectDetail?.id === project.id && (
                  <section className="test-projects-page__card" style={{ marginTop: '1rem' }}>
                    <h2 className="test-projects-page__section-title">
                      Project Details &mdash; {selectedProjectDetail.name}
                    </h2>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <tbody>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600, width: '180px' }}>ID</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.id}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Name</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.name}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Description</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.description || '—'}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Team Size</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.team_size ?? '—'}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Skills</td><td style={{ padding: '0.35rem 0.5rem' }}>{(selectedProjectDetail.skills ?? []).join(', ') || '—'}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Looking For</td><td style={{ padding: '0.35rem 0.5rem' }}>{(selectedProjectDetail.looking_for_roles ?? []).join(', ') || '—'}</td></tr>
                        <tr style={{ borderTop: '2px solid #333' }}>
                          <td colSpan={2} style={{ padding: '0.5rem', fontWeight: 700, fontSize: '1rem', color: '#a78bfa' }}>Sponsor Information</td>
                        </tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Sponsor Name</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.sponsor_name || '—'}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Company</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.sponsor_company || '—'}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Sponsor Email</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.sponsor_email ? <a href={`mailto:${selectedProjectDetail.sponsor_email}`}>{selectedProjectDetail.sponsor_email}</a> : '—'}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Website</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.sponsor_website ? <a href={selectedProjectDetail.sponsor_website} target="_blank" rel="noopener noreferrer">{selectedProjectDetail.sponsor_website}</a> : '—'}</td></tr>
                        <tr><td style={{ padding: '0.35rem 0.5rem', fontWeight: 600 }}>Description</td><td style={{ padding: '0.35rem 0.5rem' }}>{selectedProjectDetail.sponsor_description || '—'}</td></tr>
                      </tbody>
                    </table>
                    <button
                      type="button"
                      onClick={() => setSelectedProjectDetail(null)}
                      style={{ marginTop: '0.75rem' }}
                    >
                      Close
                    </button>
                  </section>
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

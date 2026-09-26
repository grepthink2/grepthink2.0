import React, { useEffect, useState, useMemo } from 'react';
import { X, Users, UserPlus, Search, Check, XCircle, Trash2, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import type {
  ApiProject,
  ApiProjectMember,
  ApiProjectJoinRequest,
  ApiStudent,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useClassRole } from '@/lib/classContext';
import { CLASS_ROLE_LABELS } from '@features/app/config/routePermissions';
import './MemberManagerModal.scss';

import { emailToDisplayName, getInitials } from '@/features/app/utils/memberUtils';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import { MessageButton } from '@features/messages/components/MessageButton';

/** Their role in this class (Student or TA), not the account role: an account that may create
 * classes can be a student or TA in this one. '' when an older backend leaves it out. */
function classRoleLabel(student: ApiStudent): string {
  return student.enrollment_role ? CLASS_ROLE_LABELS[student.enrollment_role] : '';
}

function projectRoleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'Product Owner';
    case 'scrum_master':
      return 'Scrum Master';
    case 'admin':
      return 'Admin';
    default:
      return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export interface MemberManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  classId: string;
  project: ApiProject;
  initialMembers: ApiProjectMember[];
  onMembersChange?: () => void;
}

type TabId = 'current' | 'add';

const MemberManagerModal: React.FC<MemberManagerModalProps> = ({
  isOpen,
  onClose,
  projectId,
  classId,
  project,
  initialMembers,
  onMembersChange,
}) => {
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const [activeTab, setActiveTab] = useState<TabId>('current');
  const [members, setMembers] = useState<ApiProjectMember[]>(initialMembers);
  const [requests, setRequests] = useState<ApiProjectJoinRequest[]>([]);
  const [classStudents, setClassStudents] = useState<ApiStudent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [exitingRequestIds, setExitingRequestIds] = useState<Set<string>>(new Set());
  /** userId → requestId for pending team invites (non-instructor flow) */
  const [invitedMap, setInvitedMap] = useState<Record<string, string>>({});
  /** userId being hovered in the Invited button (to show Unsend) */
  const [unsendHoverId, setUnsendHoverId] = useState<string | null>(null);
  const [unsendingId, setUnsendingId] = useState<string | null>(null);

  const isInstructor = useClassRole(classId) === 'instructor';
  const showingAddTab = isOpen && activeTab === 'add';

  // Each opening, and each fresh member list from the parent, starts from that
  // list with an empty search and no stale error; the effect below refetches.
  const [openedWith, setOpenedWith] = useState({ isOpen, projectId, initialMembers });
  if (
    openedWith.isOpen !== isOpen ||
    openedWith.projectId !== projectId ||
    openedWith.initialMembers !== initialMembers
  ) {
    setOpenedWith({ isOpen, projectId, initialMembers });
    if (isOpen) {
      setMembers(initialMembers);
      setActionError(null);
      setSearchQuery('');
    }
  }

  // The Add tab reloads the class roster whenever it comes into view or its
  // inputs change while shown; the skeleton stays up until that request settles.
  const [addTabInputs, setAddTabInputs] = useState({ showingAddTab, classId, projectId, isInstructor });
  if (
    addTabInputs.showingAddTab !== showingAddTab ||
    addTabInputs.classId !== classId ||
    addTabInputs.projectId !== projectId ||
    addTabInputs.isInstructor !== isInstructor
  ) {
    setAddTabInputs({ showingAddTab, classId, projectId, isInstructor });
    if (showingAddTab) setLoadingStudents(true);
  }

  const teamSize = typeof project.team_size === 'number' && Number.isFinite(project.team_size)
    ? project.team_size
    : 0;
  const currentCount = members.length;
  const spotsRemaining = teamSize > 0 ? Math.max(0, teamSize - currentCount) : 0;
  const summaryText = teamSize > 0
    ? `${currentCount}/${teamSize} members • ${spotsRemaining} spots available`
    : `${currentCount} members`;

  const fetchMembers = async () => {
    try {
      const res = await api.getProjectMembers(projectId);
      setMembers(res.members ?? []);
    } catch {
      // keep current state
    }
  };

  const fetchRequests = async () => {
    try {
      const res = await api.getProjectJoinRequests(projectId);
      setRequests(res.requests ?? []);
    } catch {
      setRequests([]);
    }
  };

  // Refetch on open, and whenever the parent hands over a new member list
  // (it has just refetched after a change).
  useEffect(() => {
    if (!isOpen) return;
    api
      .getProjectMembers(projectId)
      .then((res) => setMembers(res.members ?? []))
      .catch(() => {
        // keep current state
      });
    api
      .getProjectJoinRequests(projectId)
      .then((res) => setRequests(res.requests ?? []))
      .catch(() => setRequests([]));
  }, [isOpen, projectId, initialMembers]);

  useEffect(() => {
    if (!showingAddTab) return;
    api
      .getClassStudents(classId)
      .then((res) => setClassStudents(res.students ?? []))
      .catch(() => setClassStudents([]))
      .finally(() => setLoadingStudents(false));
    if (!isInstructor) {
      api.getProjectPendingInvites(projectId).then(({ invites }) => {
        const map: Record<string, string> = {};
        for (const inv of invites) {
          map[inv.user_id] = inv.request_id;
        }
        setInvitedMap(map);
      }).catch(() => {/* keep existing map */});
    }
  }, [showingAddTab, classId, projectId, isInstructor]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classStudents.filter((s) => {
      const studentId = s.id ?? (s as { user_id?: string }).user_id;
      if (!studentId) return false;
      if (!q) return true;
      const email = (s.email ?? '').toLowerCase();
      const role = classRoleLabel(s).toLowerCase();
      const name = emailToDisplayName(s.email).toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [classStudents, searchQuery]);

  const handleRequestCardAnimationEnd = (requestId: string) => {
    setExitingRequestIds((prev) => {
      if (!prev.has(requestId)) return prev;
      const next = new Set(prev);
      next.delete(requestId);
      return next;
    });
    setRequests((prev) => prev.filter((r) => r.request_id !== requestId));
    fetchRequests();
  };

  const handleAccept = async (requestId: string) => {
    setActionError(null);
    setAcceptingId(requestId);
    try {
      await api.acceptProjectJoinRequest(requestId);
      setExitingRequestIds((prev) => new Set(prev).add(requestId));
      await fetchMembers();
      onMembersChange?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to accept request');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = async (requestId: string) => {
    setActionError(null);
    setDecliningId(requestId);
    try {
      await api.rejectProjectJoinRequest(requestId);
      setExitingRequestIds((prev) => new Set(prev).add(requestId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to decline request');
    } finally {
      setDecliningId(null);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    setActionError(null);
    setRemovingMemberId(userId);
    try {
      await api.removeProjectMember(projectId, userId);
      await fetchMembers();
      onMembersChange?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleInvite = async (userId: string) => {
    setActionError(null);
    setInvitingId(userId);
    try {
      const res = await api.addProjectMember(projectId, { user_id: userId, role: 'member' });
      // Non-instructors get a pending invite; instructors get an immediate add
      const requestId = res.request?.id;
      if (requestId) {
        setInvitedMap((prev) => ({ ...prev, [userId]: requestId }));
      } else {
        await fetchMembers();
        onMembersChange?.();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setInvitingId(null);
    }
  };

  const handleUnsend = async (userId: string) => {
    const requestId = invitedMap[userId];
    if (!requestId || unsendingId) return;
    setUnsendingId(userId);
    try {
      await api.cancelTeamInvite(requestId);
      setInvitedMap((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to cancel invite');
    } finally {
      setUnsendingId(null);
      setUnsendHoverId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="member-manager-backdrop" onClick={onClose}>
      <div className="member-manager" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="member-manager__close"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={24} />
        </button>

        <header className="member-manager__header">
          <h2 className="member-manager__title">Team Management</h2>
          <p className="member-manager__summary">{summaryText}</p>
        </header>

        <div className="member-manager__tabs">
          <button
            type="button"
            className={`member-manager__tab ${activeTab === 'current' ? 'member-manager__tab--active' : ''}`}
            onClick={() => setActiveTab('current')}
          >
            <Users size={18} />
            <span>Current Members ({currentCount})</span>
          </button>
          <button
            type="button"
            className={`member-manager__tab ${activeTab === 'add' ? 'member-manager__tab--active' : ''}`}
            onClick={() => setActiveTab('add')}
          >
            <UserPlus size={18} />
            <span>Add Members</span>
          </button>
        </div>

        <div className="member-manager__body">
          {activeTab === 'current' && (
            <>
              {actionError && (
                <p className="member-manager__error" role="alert">
                  {actionError}
                </p>
              )}
              {requests.length > 0 && (
                <section className="member-manager__section">
                  <h3 className="member-manager__section-title">Project Requests</h3>
                  <ul className="member-manager__list">
                    {requests.map((req) => {
                      const name = emailToDisplayName(req.email);
                      const initials = getInitials(name, req.email ?? '');
                      const isAccepting = acceptingId === req.request_id;
                      const isDeclining = decliningId === req.request_id;
                      const isExiting = exitingRequestIds.has(req.request_id);
                      return (
                        <li
                          key={req.request_id}
                          className={`member-manager__card member-manager__card--request${isExiting ? ' member-manager__card--exiting' : ''}`}
                          onAnimationEnd={isExiting ? () => handleRequestCardAnimationEnd(req.request_id) : undefined}
                        >
                          <div className="member-manager__avatar">{initials}</div>
                          <div className="member-manager__card-main">
                            <span className="member-manager__name">{name}</span>
                            <span className="member-manager__email">{req.email}</span>
                            {req.user_role && (
                              <div className="member-manager__skills">
                                <span className="member-manager__skill-tag">{req.user_role}</span>
                              </div>
                            )}
                            {req.message && (
                              <p className="member-manager__request-note">
                                &ldquo;{req.message}&rdquo;
                              </p>
                            )}
                          </div>
                          <div className="member-manager__card-actions">
                            <div className="member-manager__request-decision">
                              <button
                                type="button"
                                className="member-manager__btn member-manager__btn--accept"
                                onClick={() => handleAccept(req.request_id)}
                                disabled={isAccepting || isDeclining}
                                aria-label={`Accept ${name}`}
                              >
                                <Check size={16} />
                                {isAccepting ? 'Accepting...' : 'Accept'}
                              </button>
                              <button
                                type="button"
                                className="member-manager__btn member-manager__btn--decline"
                                onClick={() => handleDecline(req.request_id)}
                                disabled={isAccepting || isDeclining}
                                aria-label={`Decline ${name}`}
                              >
                                <XCircle size={16} />
                                {isDeclining ? 'Declining...' : 'Decline'}
                              </button>
                            </div>
                            {req.user_id && (
                              <div className="member-manager__request-message">
                                <MessageButton
                                  toUserId={req.user_id}
                                  toUserName={name}
                                  className="member-manager__btn member-manager__btn--message"
                                />
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              <section className="member-manager__section">
                <h3 className="member-manager__section-title">
                  {requests.length > 0 ? 'Current Members' : 'Members'}
                </h3>
                  <ul className="member-manager__list">
                    {members.length === 0 ? (
                      <li className="member-manager__empty">No members yet.</li>
                    ) : (
                      members.map((m) => {
                        const name = emailToDisplayName(m.email);
                        const initials = getInitials(name, m.email ?? '');
                        const roleLabel = projectRoleLabel(m.project_role);
                        const isRemoving = removingMemberId === m.user_id;
                        const isSelfOwner = currentUserId != null && m.user_id === currentUserId && m.project_role === 'owner';
                        return (
                          <li key={m.user_id} className="member-manager__card member-manager__card--member">
                            <div className="member-manager__avatar">{initials}</div>
                            <div className="member-manager__card-main">
                              <span className="member-manager__name">{name}</span>
                              <span className="member-manager__email">{m.email}</span>
                              {m.user_role && (
                                <div className="member-manager__skills">
                                  <span className="member-manager__skill-tag">{m.user_role}</span>
                                </div>
                              )}
                            </div>
                            <div className="member-manager__card-right">
                              <span className="member-manager__role-tag">{roleLabel}</span>
                              {!isSelfOwner && (
                                <button
                                  type="button"
                                  className="member-manager__btn member-manager__btn--remove"
                                  onClick={() => handleRemoveMember(m.user_id)}
                                  disabled={isRemoving}
                                  aria-label={`Remove ${name}`}
                                  title="Remove member"
                                >
                                  <Trash2 size={16} />
                                  {isRemoving ? 'Removing...' : 'Remove'}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })
                    )}
                  </ul>
              </section>
            </>
          )}

          {activeTab === 'add' && (
            <>
              {actionError && (
                <p className="member-manager__error" role="alert">
                  {actionError}
                </p>
              )}
              <div className="member-manager__search-wrap">
                <Search size={20} className="member-manager__search-icon" />
                <input
                  type="search"
                  className="member-manager__search"
                  placeholder="Search by name, email, or skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search members"
                />
              </div>
              {loadingStudents ? (
                <ul className="member-manager__list" aria-busy="true">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <li key={i} className="member-manager__card">
                      <div className="member-manager__avatar member-manager__avatar--grey">
                        <Skeleton circle height={40} />
                      </div>
                      <div className="member-manager__card-main">
                        <Skeleton width="45%" height={13} />
                        <Skeleton width="60%" height={11} style={{ marginTop: 4 }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="member-manager__list">
                  {filteredStudents.length === 0 ? (
                    <li className="member-manager__empty">
                      {classStudents.length === 0
                        ? 'No students in this class.'
                        : 'No matches for your search.'}
                    </li>
                  ) : (
                    filteredStudents.map((s) => {
                      const studentId = s.id ?? (s as { user_id?: string }).user_id ?? '';
                      const name = emailToDisplayName(s.email);
                      const initials = getInitials(name, s.email ?? '');
                      const isAlreadyMember = memberIds.has(studentId);
                      const isInviting = invitingId === studentId;
                      const isInvited = !isInstructor && Boolean(invitedMap[studentId]);
                      const isUnsending = unsendingId === studentId;
                      const isHoveringUnsend = unsendHoverId === studentId;
                      const canInvite = spotsRemaining > 0 && !isAlreadyMember && !isInvited;
                      const actionLabel = isInviting ? 'Adding...' : isInstructor ? 'Add' : 'Invite';
                      const roleLabel = classRoleLabel(s);
                      return (
                        <li key={studentId} className="member-manager__card">
                          <div className="member-manager__avatar member-manager__avatar--grey">
                            {initials}
                          </div>
                          <div className="member-manager__card-main">
                            <span className="member-manager__name">{name}</span>
                            <span className="member-manager__email">{s.email}</span>
                            {roleLabel && (
                              <div className="member-manager__skills">
                                <span className="member-manager__skill-tag">{roleLabel}</span>
                              </div>
                            )}
                          </div>
                          {isAlreadyMember ? (
                            <span className="member-manager__btn member-manager__btn--added" aria-label={`${name} is already on the team`}>
                              <Check size={16} />
                              Added
                            </span>
                          ) : isInvited ? (
                            <button
                              type="button"
                              className={`member-manager__btn member-manager__btn--invited${isHoveringUnsend ? ' member-manager__btn--unsend' : ''}`}
                              onClick={() => void handleUnsend(studentId)}
                              disabled={isUnsending}
                              onMouseEnter={() => setUnsendHoverId(studentId)}
                              onMouseLeave={() => setUnsendHoverId(null)}
                              aria-label={isHoveringUnsend ? `Cancel invite for ${name}` : `${name} has been invited`}
                            >
                              {isUnsending ? (
                                'Cancelling…'
                              ) : isHoveringUnsend ? (
                                <>
                                  <XCircle size={16} />
                                  Unsend
                                </>
                              ) : (
                                <>
                                  <Mail size={16} />
                                  Invited
                                </>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="member-manager__btn member-manager__btn--invite"
                              onClick={() => handleInvite(studentId)}
                              disabled={!canInvite || isInviting}
                              aria-label={`${actionLabel} ${name}`}
                            >
                              <UserPlus size={16} />
                              {actionLabel}
                            </button>
                          )}
                        </li>
                      );
                    })
                  )}
                </ul>
              )}
            </>
          )}
        </div>

        <footer className="member-manager__footer">
          <span className="member-manager__spots">
            <span className="member-manager__spots-dot" aria-hidden />
            {spotsRemaining} spots remaining
          </span>
          <button
            type="button"
            className="member-manager__done"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
};

export default MemberManagerModal;

import React from 'react';
import { Crown, Star } from 'lucide-react';
import AdminMemberCard from './AdminMemberCard';
import type { MemberOption } from './types';

interface TeamTabProps {
  memberOptions: MemberOption[];
  /** The project creator (role 'owner') — shown as a non-toggleable badge in Admin Access. */
  projectOwnerId: string | null;
  /** The Scrum 'product owner' role — controlled by the dropdown. */
  productOwnerId: string | null;
  onProductOwnerChange: (id: string | null) => void;
  scrumMasterId: string | null;
  onScrumMasterChange: (id: string | null) => void;
  adminIds: Set<string>;
  onToggleAdmin: (userId: string) => void;
  canManageAdmins?: boolean;
  canEditProjectDetails?: boolean;
}

const TeamTab: React.FC<TeamTabProps> = ({
  memberOptions,
  projectOwnerId,
  productOwnerId,
  onProductOwnerChange,
  scrumMasterId,
  onScrumMasterChange,
  adminIds,
  onToggleAdmin,
  canManageAdmins = false,
  canEditProjectDetails = true,
}) => {
  return (
    <>
      {canEditProjectDetails && (
        <section className="edit-project__section">
          <h3 className="edit-project__section-title">Team Roles</h3>
          <p className="edit-project__section-hint">
            Assign key roles to members. Each role can only be held by one person.
          </p>

          <div className="edit-project__role-row">
            <div className="edit-project__role-label-wrap">
              <Crown size={16} className="edit-project__role-icon edit-project__role-icon--owner" />
              <span className="edit-project__role-name">Product Owner</span>
            </div>
            <select
              className="edit-project__select"
              value={productOwnerId ?? ''}
              onChange={(e) => onProductOwnerChange(e.target.value || null)}
              aria-label="Select Product Owner"
            >
              {memberOptions.map((m) => (
                <option key={m.userId} value={m.userId} disabled={m.userId === scrumMasterId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="edit-project__role-row">
            <div className="edit-project__role-label-wrap">
              <Star size={16} className="edit-project__role-icon edit-project__role-icon--scrum" />
              <span className="edit-project__role-name">Scrum Master</span>
            </div>
            <select
              className="edit-project__select"
              value={scrumMasterId ?? ''}
              onChange={(e) => onScrumMasterChange(e.target.value || null)}
              aria-label="Select Scrum Master"
            >
              <option value="">— Unassigned —</option>
              {memberOptions.map((m) => (
                <option key={m.userId} value={m.userId} disabled={m.userId === productOwnerId}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {/* Admin Access — instructors and class TAs only */}
      {canManageAdmins && (
        <section className="edit-project__section">
          <h3 className="edit-project__section-title">Admin Access</h3>
          <p className="edit-project__section-hint">
            Admins can manage team members and project settings. Only instructors and TAs can assign this role.
          </p>
          {memberOptions.length === 0 ? (
            <p className="edit-project__empty">No members on this project yet.</p>
          ) : (
            <ul className="edit-project__member-list">
              {memberOptions.map((m) => (
                <AdminMemberCard
                  key={m.userId}
                  member={m}
                  isOwner={m.userId === projectOwnerId}
                  isProductOwner={m.userId === productOwnerId}
                  isAdmin={adminIds.has(m.userId)}
                  onToggleAdmin={onToggleAdmin}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
};

export default TeamTab;

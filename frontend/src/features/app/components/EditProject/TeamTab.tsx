import React from 'react';
import { Crown, Star } from 'lucide-react';
import AdminMemberCard from './AdminMemberCard';
import type { MemberOption } from './types';

interface TeamTabProps {
  memberOptions: MemberOption[];
  productOwnerId: string | null;
  onProductOwnerChange: (id: string | null) => void;
  scrumMasterId: string | null;
  onScrumMasterChange: (id: string | null) => void;
  adminIds: Set<string>;
  onToggleAdmin: (userId: string) => void;
}

const TeamTab: React.FC<TeamTabProps> = ({
  memberOptions,
  productOwnerId,
  onProductOwnerChange,
  scrumMasterId,
  onScrumMasterChange,
  adminIds,
  onToggleAdmin,
}) => {
  return (
    <>
      {/* Team Roles */}
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
            <option value="">— Unassigned —</option>
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

      {/* Admin Access */}
      <section className="edit-project__section">
        <h3 className="edit-project__section-title">Admin Access</h3>
        <p className="edit-project__section-hint">
          Admins can manage team members and project settings.
        </p>
        {memberOptions.length === 0 ? (
          <p className="edit-project__empty">No members on this project yet.</p>
        ) : (
          <ul className="edit-project__member-list">
            {memberOptions.map((m) => (
              <AdminMemberCard
                key={m.userId}
                member={m}
                isOwner={m.userId === productOwnerId}
                isAdmin={adminIds.has(m.userId)}
                onToggleAdmin={onToggleAdmin}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
};

export default TeamTab;

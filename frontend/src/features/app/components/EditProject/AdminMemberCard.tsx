import React from 'react';
import { Shield, XCircle } from 'lucide-react';
import { getInitials } from '@/features/app/utils/memberUtils';
import type { MemberOption } from './types';

interface AdminMemberCardProps {
  member: MemberOption;
  isOwner: boolean;
  isProductOwner: boolean;
  isAdmin: boolean;
  onToggleAdmin: (userId: string) => void;
}

const AdminMemberCard: React.FC<AdminMemberCardProps> = ({
  member,
  isOwner,
  isProductOwner,
  isAdmin,
  onToggleAdmin,
}) => {
  const initials = getInitials(member.displayName, member.email);

  return (
    <li className="edit-project__member-card">
      <div className="edit-project__avatar">{initials}</div>
      <div className="edit-project__member-info">
        <span className="edit-project__member-name">{member.displayName}</span>
        <span className="edit-project__member-email">{member.email}</span>
      </div>
      <div className="edit-project__member-actions">
        {isOwner ? (
          <span className="edit-project__role-badge edit-project__role-badge--owner">
            Owner
          </span>
        ) : isProductOwner ? (
          <span className="edit-project__role-badge edit-project__role-badge--product-owner">
            Product Owner
          </span>
        ) : (
          <button
            type="button"
            className={`edit-project__toggle${isAdmin ? ' edit-project__toggle--on' : ''}`}
            onClick={() => onToggleAdmin(member.userId)}
            aria-pressed={isAdmin}
            aria-label={`${isAdmin ? 'Revoke admin from' : 'Grant admin to'} ${member.displayName}`}
          >
            {isAdmin ? (
              <>
                <span className="edit-project__toggle-default">
                  <Shield size={14} />
                  Admin
                </span>
                <span className="edit-project__toggle-hover">
                  <XCircle size={14} />
                  Remove Admin
                </span>
              </>
            ) : (
              <>
                <Shield size={14} />
                Give Admin
              </>
            )}
          </button>
        )}
      </div>
    </li>
  );
};

export default AdminMemberCard;

export function emailToDisplayName(email: string | undefined): string {
  if (!email) return 'Unknown';
  const local = email.split('@')[0];
  if (!local) return email;
  return local.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function getInitials(name: string, email: string): string {
  if (name && name !== 'Unknown') {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (email) {
    const local = email.split('@')[0];
    if (local.length >= 2) return local.slice(0, 2).toUpperCase();
    return local[0].toUpperCase();
  }
  return '?';
}

/** Prefer the verified school (roster) email; fall back to the primary account email. */
export function getMemberCopyEmail(member: {
  edu_email?: string | null;
  email?: string | null;
}): string | null {
  const eduEmail = member.edu_email?.trim();
  if (eduEmail) return eduEmail;
  const email = member.email?.trim();
  return email || null;
}

/**
 * Labels for the `project_members.role` values the backend writes (app/projects/controller.py).
 * `owner` is the project's creator, a different role from `product owner`.
 */
const PROJECT_ROLE_LABELS: Partial<Record<string, string>> = {
  owner: 'Owner',
  'product owner': 'Product Owner',
  'scrum master': 'Scrum Master',
  admin: 'Admin',
  member: 'Member',
};

/**
 * Human label for a project member's role. Case and stray whitespace are ignored and underscores
 * read as spaces, so `scrum_master` reads "Scrum Master" just like the stored `scrum master`.
 * A missing or blank role reads "Member"; a role outside the backend's five gets every word
 * capitalised.
 */
export function projectRoleLabel(role: string | null | undefined): string {
  const key = (role ?? '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!key) return 'Member';
  return (
    PROJECT_ROLE_LABELS[key] ??
    key
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

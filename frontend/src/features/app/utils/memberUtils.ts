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

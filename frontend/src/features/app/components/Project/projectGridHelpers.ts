import type { ProjectGridItem } from './ProjectGrid';

export interface ProjectListRow {
  id: string;
  name: string;
  team_size?: number | string;
  member_count?: number;
}

export function parseTeamSize(team_size?: number | string, fallback = 4): number {
  if (typeof team_size === 'number' && !Number.isNaN(team_size)) {
    return team_size;
  }
  if (typeof team_size === 'string') {
    const parsed = parseInt(team_size, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/** Open when the team has fewer members than its configured capacity. */
export function recruitmentStatus(
  memberCount: number | undefined,
  teamSize: number,
): ProjectGridItem['status'] {
  const members = memberCount ?? 0;
  if (teamSize <= 0) return 'open';
  return members < teamSize ? 'open' : 'closed';
}

export function toProjectGridItem(raw: ProjectListRow): ProjectGridItem {
  const team_size = parseTeamSize(raw.team_size);
  const member_count =
    typeof raw.member_count === 'number' ? raw.member_count : undefined;

  return {
    id: raw.id,
    name: raw.name,
    team_size,
    member_count,
    status: recruitmentStatus(member_count, team_size),
  };
}

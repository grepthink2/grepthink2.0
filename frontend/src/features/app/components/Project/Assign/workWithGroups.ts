import type { Student } from './assignTypes';

/** Alphanumeric sort key for picking the work-with group leader. */
export function compareStudentDisplayName(a: Student, b: Student): number {
  const aKey = (a.name || a.email || a.id).trim();
  const bKey = (b.name || b.email || b.id).trim();
  return aKey.localeCompare(bKey, undefined, { sensitivity: 'base', numeric: true });
}

/**
 * Cluster students by undirected "want to work with" links. Within each
 * cluster the alphabetically first student is the top-level leader; the rest
 * nest under that leader only (mutual picks no longer hide both).
 */
export function buildWorkWithGroups(students: Student[]): {
  leaderIds: Set<string>;
  nestedByLeaderId: Map<string, string[]>;
} {
  const byId = new Map(students.map((s) => [s.id, s]));
  const adj = new Map<string, Set<string>>();

  const link = (a: string, b: string) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b);
    adj.get(b)!.add(a);
  };

  for (const s of students) {
    if (!adj.has(s.id)) adj.set(s.id, new Set());
    for (const tid of s.teammateIds ?? []) {
      link(s.id, tid);
    }
  }

  const visited = new Set<string>();
  const leaderIds = new Set<string>();
  const nestedByLeaderId = new Map<string, string[]>();

  for (const seed of students) {
    if (visited.has(seed.id)) continue;

    const component: Student[] = [];
    const stack = [seed.id];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const student = byId.get(id);
      if (student) component.push(student);
      for (const neighbor of adj.get(id) ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }

    component.sort(compareStudentDisplayName);
    const leader = component[0];
    leaderIds.add(leader.id);
    if (component.length > 1) {
      nestedByLeaderId.set(
        leader.id,
        component.slice(1).map((s) => s.id),
      );
    }
  }

  return { leaderIds, nestedByLeaderId };
}

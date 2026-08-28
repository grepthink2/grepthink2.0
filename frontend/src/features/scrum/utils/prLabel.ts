/** Short chip label for a linked PR/MR: "PR #42" (GitHub) or "!17" (GitLab). */
export function prLabel(prUrl: string | null, provider: string | null): string | null {
  if (!prUrl) return null;
  const gh = prUrl.match(/\/pull\/(\d+)\/?$/);
  if (gh) return `PR #${gh[1]}`;
  const gl = prUrl.match(/\/merge_requests\/(\d+)\/?$/);
  if (gl) return `!${gl[1]}`;
  return provider === 'gitlab' ? 'MR' : 'PR';
}

/** Chip state class; an unfetched/unknown state renders as the gray draft chip. */
export function prState(state: string | null): 'open' | 'merged' | 'closed' | 'draft' {
  return state === 'open' || state === 'merged' || state === 'closed' ? state : 'draft';
}

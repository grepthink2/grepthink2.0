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

// Mirrors GITHUB_RE and GITLAB_RE in backend/app/scrum/pr_links.py, which is the
// authority: a link this accepts can still be refused there, never the reverse.
const GITHUB_PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+\/?$/;
const GITLAB_MR = /^https:\/\/git\.ucsc\.edu\/(?:[\w.-]+\/)+[\w.-]+\/-\/merge_requests\/\d+\/?$/;

/** Whether `url` is a link the backend can attach to a task. */
export function isPrUrl(url: string): boolean {
  return GITHUB_PR.test(url) || GITLAB_MR.test(url);
}

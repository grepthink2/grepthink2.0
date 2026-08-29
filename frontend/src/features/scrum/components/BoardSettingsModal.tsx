import { useEffect, useState } from 'react';
import { Github, Gitlab, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiScrumRepo } from '@/lib/api';
import type { EstimateScale } from '../config/scrumTags';
import { ScalePicker } from './ScalePicker';
import './BoardSettingsModal.scss';

interface Props {
  projectId: string;
  scale: EstimateScale;
  canWrite: boolean;
  onClose: () => void;
  onChangeScale: (scale: EstimateScale) => void;
  onNotice: (kind: 'error' | 'success', message: string) => void;
}

/**
 * Board settings — estimate scale (D3) and the per-project repo registry (D8).
 *
 * Repo tokens are write-only by design: the API returns `has_token` and never
 * the credential, so this panel can show that a token is set but can never
 * display or pre-fill one.
 */
export default function BoardSettingsModal({
  projectId, scale, canWrite, onClose, onChangeScale, onNotice,
}: Props) {
  const [repos, setRepos] = useState<ApiScrumRepo[] | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    api.getScrumRepos(projectId)
      .then(({ repos: rows }) => { if (alive) setRepos(rows); })
      .catch(() => { if (alive) setRepos([]); });
    return () => { alive = false; };
  }, [projectId]);

  const addRepo = async () => {
    const url = repoUrl.trim();
    if (!url || saving) return;
    setSaving(true);
    try {
      const { repo } = await api.addScrumRepo(projectId, {
        repo_url: url,
        ...(token.trim() ? { access_token: token.trim() } : {}),
      });
      setRepos((prev) => [...(prev ?? []).filter((r) => r.id !== repo.id), repo]);
      setRepoUrl('');
      setToken('');
      onNotice('success', 'Repository saved');
    } catch (err) {
      onNotice('error', err instanceof Error ? err.message : 'Couldn’t save the repository');
    } finally {
      setSaving(false);
    }
  };

  const removeRepo = async (repo: ApiScrumRepo) => {
    try {
      await api.deleteScrumRepo(repo.id);
      setRepos((prev) => (prev ?? []).filter((r) => r.id !== repo.id));
      onNotice('success', 'Repository removed');
    } catch (err) {
      onNotice('error', err instanceof Error ? err.message : 'Couldn’t remove the repository');
    }
  };

  return (
    <div className="board-settings-backdrop" onClick={onClose} role="presentation">
      <div
        className="board-settings"
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="board-settings__close" onClick={onClose} aria-label="Close settings">
          <X size={20} />
        </button>
        <h2 className="board-settings__title" id="board-settings-title">Board settings</h2>

        <section className="board-settings__section">
          <h3 className="board-settings__section-title">Estimate scale</h3>
          <p className="board-settings__hint">
            Changing the scale only changes the values offered from now on — points already
            on stories and tasks stay as they are.
          </p>
          <ScalePicker value={scale} onChange={canWrite ? onChangeScale : undefined} />
        </section>

        <section className="board-settings__section">
          <h3 className="board-settings__section-title">Repositories</h3>
          <p className="board-settings__hint">
            Link the team’s repositories so pull requests show their status on task cards.
            A token is optional and write-only — it is never shown again, and adding the same
            repository replaces it. Status checks for git.ucsc.edu may not reach the campus
            server yet; those links still open normally.
          </p>

          {repos === null && <p className="board-settings__loading">Loading repositories…</p>}
          {repos?.length === 0 && <p className="board-settings__empty">No repositories linked yet.</p>}

          {repos && repos.length > 0 && (
            <ul className="board-settings__repos">
              {repos.map((r) => (
                <li key={r.id} className="board-settings__repo">
                  {r.provider === 'gitlab'
                    ? <Gitlab size={14} aria-hidden="true" />
                    : <Github size={14} aria-hidden="true" />}
                  <span className="board-settings__repo-url">{r.repo_url}</span>
                  {r.has_token && <span className="board-settings__token-chip">Token set</span>}
                  {canWrite && (
                    <button
                      type="button"
                      className="board-settings__repo-remove"
                      aria-label={`Remove ${r.repo_url}`}
                      onClick={() => removeRepo(r)}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <div className="board-settings__add">
              <label>
                <span className="board-settings__label">Repository URL</span>
                <input
                  type="url"
                  value={repoUrl}
                  placeholder="https://github.com/team/project"
                  onChange={(e) => setRepoUrl(e.target.value)}
                />
              </label>
              <label>
                <span className="board-settings__label">Access token (optional)</span>
                <input
                  type="password"
                  value={token}
                  autoComplete="off"
                  placeholder="Leave blank for public repositories"
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="board-settings__add-button"
                onClick={addRepo}
                disabled={!repoUrl.trim() || saving}
              >
                {saving ? 'Saving…' : 'Add repository'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

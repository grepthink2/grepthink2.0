import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, Search, Users } from 'lucide-react';
import { api, type ApiAssignmentTsrEntry } from '@/lib/api';
import './TSRView.scss';

export type TsrViewMode = 'about' | 'from';

const ALL_MEMBERS_ID = '';

export interface TsrViewMember {
  id: string;
  name: string;
}

interface TSRViewProps {
  assignmentId: string;
}

function memberDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null,
  fallback?: string,
): string {
  const first = (firstName ?? '').trim();
  const last = (lastName ?? '').trim();
  const full = [first, last].filter(Boolean).join(' ');
  return full || email || fallback || 'Unknown';
}

// ── Inline searchable dropdown ────────────────────────────────
interface SearchDropdownProps {
  options: { id: string; name: string; sub?: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const SearchDropdown: React.FC<SearchDropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.sub ?? '').toLowerCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    setHighlightIdx((p) => Math.min(p, Math.max(results.length - 1, 0)));
  }, [results]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${highlightIdx}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx, open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setHighlightIdx(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => (i + 1) % Math.max(results.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) =>
        (i - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1),
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[highlightIdx];
      if (hit) handleSelect(hit.id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className={`tsrv-dd${open ? ' tsrv-dd--open' : ''}${disabled ? ' tsrv-dd--disabled' : ''}`} ref={wrapperRef}>
      <button
        type="button"
        className="tsrv-dd__trigger"
        onClick={openDropdown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="tsrv-dd__value">
          {selected ? selected.name : <span className="tsrv-dd__placeholder">{placeholder}</span>}
        </span>
        <ChevronDown size={15} className="tsrv-dd__chevron" />
      </button>

      {open && (
        <div className="tsrv-dd__popover">
          <div className="tsrv-dd__search-row">
            <Search size={14} className="tsrv-dd__search-icon" />
            <input
              ref={inputRef}
              type="text"
              className="tsrv-dd__search"
              placeholder="Search…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); }}
              onKeyDown={handleKeyDown}
            />
          </div>
          <ul className="tsrv-dd__list" role="listbox" ref={listRef}>
            {results.length === 0 ? (
              <li className="tsrv-dd__empty">No results</li>
            ) : results.map((o, idx) => (
              <li key={o.id || '__all__'}>
                <button
                  type="button"
                  data-idx={idx}
                  className={[
                    'tsrv-dd__item',
                    o.id === value ? 'tsrv-dd__item--active' : '',
                    idx === highlightIdx ? 'tsrv-dd__item--highlighted' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => handleSelect(o.id)}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  role="option"
                  aria-selected={o.id === value}
                >
                  <span className="tsrv-dd__item-name">{o.name}</span>
                  {o.sub && <span className="tsrv-dd__item-sub">{o.sub}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────
const TSRView: React.FC<TSRViewProps> = ({ assignmentId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [entries, setEntries] = useState<ApiAssignmentTsrEntry[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [members, setMembers] = useState<TsrViewMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [focalMemberId, setFocalMemberId] = useState('');
  const [viewMode, setViewMode] = useState<TsrViewMode>('about');

  // ── Load overview ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const overview = await api.getAssignmentTsrOverview(assignmentId);
        if (cancelled) return;
        setProjects(overview.projects ?? []);
        setEntries(overview.entries ?? []);

        const withEntries = new Set(
          (overview.entries ?? [])
            .map((e) => e.project_id)
            .filter((id): id is string => Boolean(id)),
        );
        const first =
          overview.projects?.find((p) => withEntries.has(p.id)) ??
          overview.projects?.[0];
        setSelectedProjectId(first?.id ?? '');
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load TSR responses');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assignmentId]);

  // ── Load members for selected project ────────────────────────
  useEffect(() => {
    if (!selectedProjectId) { setMembers([]); setFocalMemberId(''); return; }
    let cancelled = false;
    setMembersLoading(true);
    (async () => {
      try {
        const { members: apiMembers } = await api.getProjectMembers(selectedProjectId);
        if (cancelled) return;

        const roster: TsrViewMember[] = apiMembers.map((m) => ({
          id: m.user_id,
          name: memberDisplayName(m.first_name, m.last_name, m.email, m.user_id),
        }));

        // Fill in any evaluators / evaluatees not on the member list
        const projectEntries = entries.filter((e) => e.project_id === selectedProjectId);
        for (const e of projectEntries) {
          if (e.evaluator_id && !roster.some((m) => m.id === e.evaluator_id)) {
            roster.push({ id: e.evaluator_id, name: e.evaluator_name ?? e.evaluator_id });
          }
          if (e.evaluatee_id && !roster.some((m) => m.id === e.evaluatee_id)) {
            roster.push({ id: e.evaluatee_id, name: e.evaluatee_name ?? e.evaluatee_id });
          }
        }
        roster.sort((a, b) => a.name.localeCompare(b.name));
        setMembers(roster);
        setFocalMemberId(ALL_MEMBERS_ID);
      } catch {
        if (!cancelled) setMembers([]);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedProjectId, entries]);

  const projectEntries = useMemo(
    () => entries.filter((e) => e.project_id === selectedProjectId),
    [entries, selectedProjectId],
  );

  const isOverview = focalMemberId === ALL_MEMBERS_ID;
  const focalMember = isOverview ? undefined : members.find((m) => m.id === focalMemberId);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const visibleRows = useMemo(() => {
    if (isOverview) {
      return [...projectEntries].sort((a, b) => {
        const byFrom = (a.evaluator_name ?? '').localeCompare(b.evaluator_name ?? '');
        return byFrom !== 0
          ? byFrom
          : (a.evaluatee_name ?? '').localeCompare(b.evaluatee_name ?? '');
      });
    }
    const filtered =
      viewMode === 'about'
        ? projectEntries.filter((e) => e.evaluatee_id === focalMemberId)
        : projectEntries.filter((e) => e.evaluator_id === focalMemberId);
    return [...filtered].sort((a, b) => {
      const nameA = viewMode === 'about' ? (a.evaluator_name ?? '') : (a.evaluatee_name ?? '');
      const nameB = viewMode === 'about' ? (b.evaluator_name ?? '') : (b.evaluatee_name ?? '');
      return nameA.localeCompare(nameB);
    });
  }, [projectEntries, focalMemberId, viewMode, isOverview]);

  const submissionCountByProject = useMemo(() => {
    const byProject: Record<string, Set<string>> = {};
    for (const e of entries) {
      if (!e.project_id || !e.evaluator_id) continue;
      (byProject[e.project_id] ??= new Set()).add(e.evaluator_id);
    }
    return Object.fromEntries(
      Object.entries(byProject).map(([pid, set]) => [pid, set.size]),
    );
  }, [entries]);

  const projectOptions = useMemo(
    () =>
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        sub:
          submissionCountByProject[p.id] != null
            ? `${submissionCountByProject[p.id]} submitted`
            : undefined,
      })),
    [projects, submissionCountByProject],
  );

  const memberOptions = useMemo(
    () => [
      { id: ALL_MEMBERS_ID, name: 'All members' },
      ...members.map((m) => ({ id: m.id, name: m.name })),
    ],
    [members],
  );

  if (loading) return <div className="tsr-view tsr-view--loading">Loading TSR responses…</div>;
  if (error) return <div className="tsr-view tsr-view--error"><p>{error}</p></div>;

  const focalName = focalMember?.name ?? 'this member';

  return (
    <div className="tsr-view">
      {projects.length === 0 ? (
        <p className="tsr-view__empty">No projects in this class yet.</p>
      ) : (
        <>
          {/* Controls row */}
          <div className="tsr-view__controls">
            <div className="tsr-view__control">
              <label className="tsr-view__control-label">
                <Users size={13} /> Team
              </label>
              <SearchDropdown
                options={projectOptions}
                value={selectedProjectId}
                onChange={setSelectedProjectId}
                placeholder="Select a team…"
              />
            </div>

            <div className="tsr-view__control">
              <label className="tsr-view__control-label">Member</label>
              <SearchDropdown
                options={memberOptions}
                value={focalMemberId}
                onChange={setFocalMemberId}
                placeholder="All members"
                disabled={membersLoading || !selectedProjectId}
              />
            </div>

            {!isOverview && (
              <div className="tsr-view__control tsr-view__control--view">
                <label className="tsr-view__control-label">View</label>
                <div className="tsr-view__mode-toggle">
                  <button
                    type="button"
                    className={`tsr-view__mode-btn${viewMode === 'about' ? ' tsr-view__mode-btn--active' : ''}`}
                    onClick={() => setViewMode('about')}
                  >
                    About {focalName}
                  </button>
                  <button
                    type="button"
                    className={`tsr-view__mode-btn${viewMode === 'from' ? ' tsr-view__mode-btn--active' : ''}`}
                    onClick={() => setViewMode('from')}
                  >
                    From {focalName}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Results */}
          <section className="tsr-view__results">
            <h2 className="tsr-view__section-title">
              {isOverview
                ? `All responses for ${selectedProject?.name ?? 'this team'} (${visibleRows.length} ${visibleRows.length === 1 ? 'response' : 'responses'})`
                : viewMode === 'about'
                  ? `What teammates said about ${focalName}`
                  : `What ${focalName} said about teammates`}
            </h2>

            {visibleRows.length === 0 ? (
              <p className="tsr-view__empty">
                {projectEntries.length === 0
                  ? 'No submissions for this team yet.'
                  : 'No responses match the selected member and view.'}
              </p>
            ) : (
              <div className="tsr-view__table-card">
                <table className={`tsr-view__table${isOverview ? ' tsr-view__table--overview' : ''}`}>
                  <thead>
                    <tr>
                      {isOverview ? (
                        <>
                          <th>From</th>
                          <th>About</th>
                        </>
                      ) : (
                        <th>{viewMode === 'about' ? 'From' : 'About'}</th>
                      )}
                      <th>Contribution</th>
                      <th>Positive feedback</th>
                      <th>Constructive feedback</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.tsr_id}>
                        {isOverview ? (
                          <>
                            <td className="tsr-view__td-name">{row.evaluator_name}</td>
                            <td className="tsr-view__td-name">{row.evaluatee_name}</td>
                          </>
                        ) : (
                          <td className="tsr-view__td-name">
                            {viewMode === 'about' ? row.evaluator_name : row.evaluatee_name}
                          </td>
                        )}
                        <td className="tsr-view__td-pct">{row.percent_contribution}%</td>
                        <td>{row.positive_feedback || '—'}</td>
                        <td>{row.constructive_feedback || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default TSRView;

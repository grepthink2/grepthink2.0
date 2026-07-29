import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, Check, ClipboardList, Video, X } from 'lucide-react';
import {
  api,
  type ApiFinalReviewDetail,
  type FinalReviewScoreEntry,
  type FinalReviewScoreRole,
} from '@/lib/api';
import { getInitials } from '@features/app/utils/memberUtils';
import {
  FINAL_REVIEW_SECTIONS,
  FINAL_REVIEW_TEMPLATE_VERSION,
  MEMBER_CONTRIBUTIONS_KEY,
  formatReviewDay,
  formatReviewTime,
} from './finalReviewTemplate';
import { Skeleton } from '@/components/Skeleton/Skeleton';
import '../components/TAManagement/TAManagement.scss';
import './FinalReviews.scss';
import './FinalReviewDetail.scss';

/** Per-student draft of one scorer role's inputs (strings while typing). */
type HomeDraft = { product: string; team: string; scrum: string; notes: string };
type OverallDraft = { overall: string; notes: string };

/** One "Set all" column — the header input applies once, on demand. */
type SetAllColumn = 'home-product' | 'home-team' | 'home-scrum' | 'review' | 'instructor';

const COLUMN_LABELS: Record<SetAllColumn, string> = {
  'home-product': 'Product',
  'home-team': 'Team',
  'home-scrum': 'Scrum',
  review: 'Review overall',
  instructor: 'Instructor overall',
};

const num = (v: number | null | undefined): string => (v == null ? '' : String(v));

/** '' → null; else a valid 1.0–5.0 number rounded to 0.1, or NaN when invalid. */
const parseScore = (raw: string): number | null => {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1 || n > 5) return Number.NaN;
  return Math.round(n * 10) / 10;
};

const Avatar: React.FC<{ name: string; email?: string | null }> = ({ name, email }) => (
  <span className="fr-avatar" aria-hidden="true">{getInitials(name || '', email || '')}</span>
);

const ScoreInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
  /** Marks the cell aria-invalid (a partial Home TA row's empty fields). */
  invalid?: boolean;
  /** Enter commits, mirroring the adjacent "Apply"/confirm button. */
  onEnter?: () => void;
}> = ({ value, onChange, label, disabled, invalid, onEnter }) => {
  const handleKeyDown = onEnter
    ? (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onEnter();
        }
      }
    : undefined;
  return (
    <input
      type="number"
      className="frd__score-input"
      min={1}
      max={5}
      step={0.1}
      inputMode="decimal"
      placeholder="–"
      aria-label={label}
      aria-invalid={invalid ? 'true' : undefined}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
    />
  );
};

/**
 * Page-shaped loading placeholder: a heading-bar block, then two card stubs —
 * a table-ish scores block (row-shaped bars) and a worksheet block (labeled
 * section bars) — so the page doesn't jump once the real workspace arrives.
 */
const FinalReviewDetailSkeleton: React.FC = () => (
  <div className="ta-page final-reviews frd">
    <div className="frd-skeleton" aria-busy="true">
      <Skeleton width={220} height={24} radius={6} />
      <Skeleton width={280} height={14} radius={4} />
      <div className="frd-skeleton__card">
        <Skeleton width={100} height={17} radius={4} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} height={34} radius={8} />
        ))}
      </div>
      <div className="frd-skeleton__card">
        <Skeleton width={150} height={17} radius={4} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} height={60} radius={8} />
        ))}
      </div>
    </div>
  </div>
);

const FinalReviewDetail: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<ApiFinalReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Confirmation text shown in the savebar once nothing is dirty anymore. */
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [homeDraft, setHomeDraft] = useState<Record<string, HomeDraft>>({});
  const [reviewDraft, setReviewDraft] = useState<Record<string, OverallDraft>>({});
  const [instrDraft, setInstrDraft] = useState<Record<string, OverallDraft>>({});
  const [scoresDirty, setScoresDirty] = useState(false);

  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [memberDraft, setMemberDraft] = useState<Record<string, string>>({});
  const [notesDirty, setNotesDirty] = useState(false);

  /** Drafts for the "Set all" header inputs — draft-only. Typing here never
   * touches a student's row; only that column's "Apply" button does. */
  const [setAllDraft, setSetAllDraft] = useState<Record<string, string>>({});
  /** The column just batch-applied, if any — drives the one-shot "Undo" in
   * the savebar. Cleared by undoing, or by the next direct edit anywhere in
   * that column (see setHomeField/setOverallField). */
  const [undoColumn, setUndoColumn] = useState<SetAllColumn | null>(null);
  /** Per-column snapshot of every student's value immediately before the
   * apply that undo restores. A ref: it backs a one-shot action, not
   * something any render reads directly. */
  const columnUndoRef = useRef<Partial<Record<SetAllColumn, Record<string, string>>>>({});

  /** Reseeds ONLY the score-side drafts from fresh server data. Split out
   * from seedDrafts so a partial save-all failure can refresh whichever
   * half actually landed without touching the other half's still-unsaved
   * draft/dirty flag (see handleSaveAll). */
  const seedScoreDrafts = useCallback((d: ApiFinalReviewDetail) => {
    const byRole = (role: FinalReviewScoreRole, sid: string) =>
      d.scores.find((s) => s.role === role && s.student_id === sid);

    const home: Record<string, HomeDraft> = {};
    const review: Record<string, OverallDraft> = {};
    const instr: Record<string, OverallDraft> = {};
    for (const m of d.members) {
      const h = byRole('home', m.user_id);
      const r = byRole('review', m.user_id);
      const p = byRole('instructor', m.user_id);
      home[m.user_id] = { product: num(h?.product), team: num(h?.team), scrum: num(h?.scrum), notes: h?.notes ?? '' };
      review[m.user_id] = { overall: num(r?.overall), notes: r?.notes ?? '' };
      instr[m.user_id] = { overall: num(p?.overall), notes: p?.notes ?? '' };
    }
    setHomeDraft(home);
    setReviewDraft(review);
    setInstrDraft(instr);
    setScoresDirty(false);
    setSetAllDraft({});
    setUndoColumn(null);
    columnUndoRef.current = {};
  }, []);

  /** Reseeds ONLY the notes-side drafts from fresh server data (see
   * seedScoreDrafts above). */
  const seedNoteDrafts = useCallback((d: ApiFinalReviewDetail) => {
    const content = (d.notes?.content ?? {}) as Record<string, unknown>;
    const fields: Record<string, string> = {};
    for (const section of FINAL_REVIEW_SECTIONS) {
      for (const f of section.fields) {
        fields[f.key] = typeof content[f.key] === 'string' ? (content[f.key] as string) : '';
      }
    }
    const contributions = (content[MEMBER_CONTRIBUTIONS_KEY] ?? {}) as Record<string, unknown>;
    const members: Record<string, string> = {};
    for (const m of d.members) {
      members[m.user_id] =
        typeof contributions[m.user_id] === 'string' ? (contributions[m.user_id] as string) : '';
    }
    setNotesDraft(fields);
    setMemberDraft(members);
    setNotesDirty(false);
  }, []);

  const seedDrafts = useCallback((d: ApiFinalReviewDetail) => {
    seedScoreDrafts(d);
    seedNoteDrafts(d);
  }, [seedScoreDrafts, seedNoteDrafts]);

  const loadDetail = useCallback(async () => {
    if (!projectId) return;
    const d = await api.getFinalReviewDetail(projectId);
    setDetail(d);
    seedDrafts(d);
  }, [projectId, seedDrafts]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDetail()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load the review');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadDetail]);

  // Auto-dismiss the savebar's "Saved" confirmation ~2.5s after it appears.
  // Re-running the effect (a new savedFlash value, e.g. one save's flash
  // replaced by the next) cleans up the previous timer before arming a new
  // one; unmount cleans it up too.
  useEffect(() => {
    if (!savedFlash) return;
    const id = window.setTimeout(() => setSavedFlash(null), 2500);
    return () => window.clearTimeout(id);
  }, [savedFlash]);

  const viewerRole = detail?.viewer_role ?? 'ta';
  const canEditHome = viewerRole === 'home' || viewerRole === 'instructor';
  const canEditReview = viewerRole === 'review' || viewerRole === 'instructor';
  const canEditInstructor = viewerRole === 'instructor';
  const canEditNotes = viewerRole === 'review' || viewerRole === 'instructor';
  const noteRole: FinalReviewScoreRole | null =
    viewerRole === 'instructor' ? 'instructor' : viewerRole === 'home' ? 'home' : viewerRole === 'review' ? 'review' : null;

  const touchScores = () => { setScoresDirty(true); setSavedFlash(null); };
  const touchNotes = () => { setNotesDirty(true); setSavedFlash(null); };

  const setHomeField = (sid: string, field: keyof HomeDraft, value: string) => {
    setHomeDraft((prev) => ({ ...prev, [sid]: { ...prev[sid], [field]: value } }));
    // A direct edit anywhere in a "Set all" column invalidates its one-shot undo.
    if (field !== 'notes' && undoColumn === `home-${field}`) setUndoColumn(null);
    touchScores();
  };
  const setOverallField = (
    role: 'review' | 'instructor', sid: string, field: keyof OverallDraft, value: string,
  ) => {
    const setter = role === 'review' ? setReviewDraft : setInstrDraft;
    setter((prev) => ({ ...prev, [sid]: { ...prev[sid], [field]: value } }));
    if (field === 'overall' && undoColumn === role) setUndoColumn(null);
    touchScores();
  };

  /** "Apply to column" — the only way a "Set all" draft reaches every
   * student's row. Snapshots the pre-apply values first so undo can restore
   * them. */
  const applyColumn = (col: SetAllColumn) => {
    if (!detail) return;
    const value = setAllDraft[col] ?? '';
    const snapshot: Record<string, string> = {};

    if (col === 'review' || col === 'instructor') {
      const source = col === 'review' ? reviewDraft : instrDraft;
      const setter = col === 'review' ? setReviewDraft : setInstrDraft;
      detail.members.forEach((m) => { snapshot[m.user_id] = source[m.user_id]?.overall ?? ''; });
      setter((prev) => {
        const next = { ...prev };
        detail.members.forEach((m) => { next[m.user_id] = { ...next[m.user_id], overall: value }; });
        return next;
      });
    } else {
      const field = col === 'home-product' ? 'product' : col === 'home-team' ? 'team' : 'scrum';
      detail.members.forEach((m) => { snapshot[m.user_id] = homeDraft[m.user_id]?.[field] ?? ''; });
      setHomeDraft((prev) => {
        const next = { ...prev };
        detail.members.forEach((m) => { next[m.user_id] = { ...next[m.user_id], [field]: value }; });
        return next;
      });
    }

    columnUndoRef.current[col] = snapshot;
    setUndoColumn(col);
    touchScores();
  };

  /** One-shot undo for the last "Apply to column" — restores the snapshot
   * taken just before it, then clears itself. */
  const undoColumnApply = () => {
    if (!undoColumn) return;
    const snapshot = columnUndoRef.current[undoColumn];
    if (snapshot) {
      if (undoColumn === 'review' || undoColumn === 'instructor') {
        const setter = undoColumn === 'review' ? setReviewDraft : setInstrDraft;
        setter((prev) => {
          const next = { ...prev };
          Object.entries(snapshot).forEach(([sid, v]) => { next[sid] = { ...next[sid], overall: v }; });
          return next;
        });
      } else {
        const field = undoColumn === 'home-product' ? 'product' : undoColumn === 'home-team' ? 'team' : 'scrum';
        setHomeDraft((prev) => {
          const next = { ...prev };
          Object.entries(snapshot).forEach(([sid, v]) => { next[sid] = { ...next[sid], [field]: v }; });
          return next;
        });
      }
    }
    delete columnUndoRef.current[undoColumn];
    setUndoColumn(null);
    touchScores();
  };

  const teamAverage = (values: (number | null | undefined)[]): string => {
    const nums = values.filter((v): v is number => typeof v === 'number');
    if (!nums.length) return '–';
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
  };

  const savedRow = (role: FinalReviewScoreRole, sid: string) =>
    detail?.scores.find((s) => s.role === role && s.student_id === sid);

  /** True when a student's role-defining score(s) are fully blanked, there's
   * a saved score to clear, AND that role's note (the draft, which is
   * seeded from the saved value unless the viewer has edited it) is
   * non-empty. Clearing deletes the WHOLE backend row — including its
   * `notes` column — so a clear that would silently drop a note is blocked
   * instead of sent (see the docstring on the backend's
   * save_final_review_scores). */
  const clearBlockedByNote = (role: FinalReviewScoreRole, sid: string): boolean => {
    const saved = savedRow(role, sid);
    if (role === 'home') {
      const d = homeDraft[sid];
      if (!d) return false;
      const filled = [d.product, d.team, d.scrum].filter((v) => v.trim() !== '').length;
      const hadSavedScore = !!saved && (saved.product != null || saved.team != null || saved.scrum != null);
      return filled === 0 && hadSavedScore && d.notes.trim() !== '';
    }
    const draft = role === 'review' ? reviewDraft[sid] : instrDraft[sid];
    if (!draft) return false;
    return draft.overall.trim() === '' && saved?.overall != null && draft.notes.trim() !== '';
  };

  /** Builds the score-save jobs from current drafts. Returns null (and sets
   * actionError) on a validation failure; otherwise an array — possibly
   * empty — of per-role upserts. Blanking a previously-saved Home TA triple
   * or overall sends explicit nulls so the backend clears that row instead
   * of silently keeping the old value — UNLESS that would also drop a
   * non-empty note (clearBlockedByNote), in which case the student is left
   * out of the entries entirely (their saved row survives unchanged). The
   * scores save is disabled from the UI while any row is note-blocked
   * (see scoresBlocked below); this is defense in depth. */
  const buildScoreJobs = (): { role: FinalReviewScoreRole; entries: FinalReviewScoreEntry[] }[] | null => {
    if (!detail) return null;
    const jobs: { role: FinalReviewScoreRole; entries: FinalReviewScoreEntry[] }[] = [];
    const nameOf = (sid: string) => detail.members.find((m) => m.user_id === sid)?.name ?? 'a student';

    if (canEditHome) {
      const entries: FinalReviewScoreEntry[] = [];
      for (const m of detail.members) {
        const d = homeDraft[m.user_id];
        if (!d) continue;
        const filled = [d.product, d.team, d.scrum].filter((v) => v.trim() !== '').length;
        if (filled === 0) {
          // All three blank — only worth an entry if there's a saved score
          // to clear (explicit null tells the backend to delete the row),
          // and only if that wouldn't also silently drop a non-empty note.
          const saved = savedRow('home', m.user_id);
          const hadSavedScore = !!saved && (saved.product != null || saved.team != null || saved.scrum != null);
          if (hadSavedScore && d.notes.trim() === '') {
            entries.push({ student_id: m.user_id, product: null, team: null, scrum: null, notes: null });
          }
          continue;
        }
        // A partial row (1–2 filled) is normally blocked from reaching save
        // by the entry-time validation below (incompleteHomeCount disables
        // the button); the backend still rejects it as defense in depth.
        const product = parseScore(d.product);
        const team = parseScore(d.team);
        const scrum = parseScore(d.scrum);
        if ([product, team, scrum].some((v) => Number.isNaN(v))) {
          setActionError(`Scores for ${nameOf(m.user_id)} must be between 1.0 and 5.0.`);
          return null;
        }
        entries.push({ student_id: m.user_id, product, team, scrum, notes: d.notes.trim() || null });
      }
      if (entries.length) jobs.push({ role: 'home', entries });
    }

    for (const role of ['review', 'instructor'] as const) {
      if (role === 'review' ? !canEditReview : !canEditInstructor) continue;
      const draft = role === 'review' ? reviewDraft : instrDraft;
      const entries: FinalReviewScoreEntry[] = [];
      for (const m of detail.members) {
        const d = draft[m.user_id];
        if (!d) continue;
        if (d.overall.trim() === '') {
          const saved = savedRow(role, m.user_id);
          if (saved?.overall != null && d.notes.trim() === '') {
            entries.push({ student_id: m.user_id, overall: null, notes: null });
          }
          continue;
        }
        const overall = parseScore(d.overall);
        if (Number.isNaN(overall)) {
          setActionError(`Overall for ${nameOf(m.user_id)} must be between 1.0 and 5.0.`);
          return null;
        }
        entries.push({ student_id: m.user_id, overall, notes: d.notes.trim() || null });
      }
      if (entries.length) jobs.push({ role, entries });
    }

    return jobs;
  };

  const runScoreJobs = async (jobs: { role: FinalReviewScoreRole; entries: FinalReviewScoreEntry[] }[]) => {
    for (const job of jobs) {
      await api.saveFinalReviewScores(projectId!, job.role, job.entries);
    }
  };

  const buildNotesContent = (): Record<string, unknown> => {
    const content: Record<string, unknown> = { ...(detail?.notes?.content ?? {}) };
    for (const section of FINAL_REVIEW_SECTIONS) {
      for (const f of section.fields) {
        const v = (notesDraft[f.key] ?? '').trim();
        if (v) content[f.key] = v; else delete content[f.key];
      }
    }
    const contributions: Record<string, string> = {};
    for (const [sid, text] of Object.entries(memberDraft)) {
      const v = text.trim();
      if (v) contributions[sid] = v;
    }
    if (Object.keys(contributions).length) content[MEMBER_CONTRIBUTIONS_KEY] = contributions;
    else delete content[MEMBER_CONTRIBUTIONS_KEY];
    return content;
  };

  const handleSaveScores = async () => {
    if (!detail || !projectId) return;
    setActionError(null);
    const jobs = buildScoreJobs();
    if (jobs === null) return;
    if (!jobs.length) {
      setActionError('Nothing to save yet — enter at least one score.');
      return;
    }
    setSaving(true);
    try {
      await runScoreJobs(jobs);
      await loadDetail();
      setSavedFlash('Scores saved');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save scores');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!detail || !projectId) return;
    setActionError(null);
    setSaving(true);
    try {
      await api.saveFinalReviewNotes(projectId, buildNotesContent(), FINAL_REVIEW_TEMPLATE_VERSION);
      await loadDetail();
      setSavedFlash('Notes saved');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAll = async () => {
    if (!detail || !projectId) return;
    setActionError(null);
    const jobs = buildScoreJobs();
    if (jobs === null) return;
    setSaving(true);
    // Tracks which half actually reached the server, so a failure partway
    // through only refreshes/resets what's true — never the half that's
    // still just a local draft.
    let scoresSaved = false;
    try {
      if (jobs.length) {
        await runScoreJobs(jobs);
        scoresSaved = true;
      }
      await api.saveFinalReviewNotes(projectId, buildNotesContent(), FINAL_REVIEW_TEMPLATE_VERSION);
      await loadDetail();
      if (scoresSaved) {
        setSavedFlash('All changes saved');
      } else {
        // scoresDirty was true (that's the only way "Save all" shows at
        // all) but there was nothing meaningful to actually send — say so
        // instead of implying the score edits were part of "All changes
        // saved" when nothing scores-related was ever persisted.
        setSavedFlash('Notes saved');
        setActionError('Scores: nothing to save yet — enter at least one score.');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save changes');
      if (scoresSaved) {
        // Scores landed server-side, notes didn't — refresh ONLY the
        // scores half so it reflects what actually saved, but leave the
        // notes draft/dirty flag exactly as the user left them. A full
        // loadDetail()/seedDrafts() here would reseed notes too, silently
        // discarding whatever the user had drafted there.
        try {
          const d = await api.getFinalReviewDetail(projectId);
          setDetail(d);
          seedScoreDrafts(d);
        } catch {
          // Best-effort resync only — scores are already saved server-side
          // regardless of whether this particular refetch succeeds.
        }
      }
      // If scores themselves never landed (scoresSaved === false), nothing
      // reached the server at all — leave every draft/dirty flag exactly as
      // the user left them, matching handleSaveScores'/handleSaveNotes' own
      // failure paths (no loadDetail() call on failure).
    } finally {
      setSaving(false);
    }
  };

  const slot = useMemo(() => {
    const iso = detail?.project.final_review_at;
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [detail]);

  if (loading) {
    return <FinalReviewDetailSkeleton />;
  }
  if (error || !detail) {
    return (
      <div className="ta-page final-reviews">
        <div className="ta-page__empty">
          <div>
            <h2>Unable to load</h2>
            <p>{error ?? 'Failed to load the review'}</p>
          </div>
        </div>
      </div>
    );
  }

  const roleLabel: Record<string, string> = {
    instructor: 'Instructor', home: "You're the Home TA", review: "You're the Review TA", ta: 'Read-only',
  };

  const otherRoleNotes = (sid: string): { label: string; text: string }[] => {
    const out: { label: string; text: string }[] = [];
    const labels: Record<FinalReviewScoreRole, string> = { home: 'Home', review: 'Review', instructor: 'Prof' };
    (['home', 'review', 'instructor'] as const).forEach((role) => {
      if (role === noteRole) return;
      const text = savedRow(role, sid)?.notes;
      if (text) out.push({ label: labels[role], text });
    });
    return out;
  };

  // Entry-time validation for the Home TA triple (all-or-nothing): a row
  // with 1–2 of product/team/scrum filled marks its empty cells invalid
  // immediately and blocks the scores save, rather than erroring after the
  // fact at save time.
  const homeIncompleteMembers = new Set(
    canEditHome
      ? detail.members
          .filter((m) => {
            const h = homeDraft[m.user_id];
            if (!h) return false;
            const filled = [h.product, h.team, h.scrum].filter((v) => v.trim() !== '').length;
            return filled > 0 && filled < 3;
          })
          .map((m) => m.user_id)
      : [],
  );
  const incompleteHomeCount = homeIncompleteMembers.size;

  // A student whose score(s) are blanked-for-clear but whose note (draft or
  // saved) is still non-empty — clearing would delete that note along with
  // the row, so the clear is blocked (and the scores save disabled) instead
  // of silently dropping it. Checked per editable role.
  const noteBlockedMembers = new Set(
    detail.members
      .filter((m) => (
        (canEditHome && clearBlockedByNote('home', m.user_id))
        || (canEditReview && clearBlockedByNote('review', m.user_id))
        || (canEditInstructor && clearBlockedByNote('instructor', m.user_id))
      ))
      .map((m) => m.user_id),
  );
  const noteBlockedCount = noteBlockedMembers.size;
  const scoresBlocked = incompleteHomeCount > 0 || noteBlockedCount > 0;

  const canSaveScores = canEditHome || canEditReview || canEditInstructor;
  const showScoresBtn = scoresDirty && canSaveScores;
  const showNotesBtn = notesDirty && canEditNotes;
  const showCombined = showScoresBtn && showNotesBtn && !scoresBlocked;
  const showSavebar = scoresDirty || notesDirty || !!savedFlash;
  const blockReasons: string[] = [];
  if (incompleteHomeCount > 0) {
    blockReasons.push(`${incompleteHomeCount} ${incompleteHomeCount === 1 ? 'student' : 'students'} incomplete`);
  }
  if (noteBlockedCount > 0) {
    blockReasons.push(`${noteBlockedCount} ${noteBlockedCount === 1 ? 'student' : 'students'} blocked by a note`);
  }
  const savebarMessage = scoresBlocked
    ? blockReasons.join(' · ')
    : (scoresDirty || notesDirty) ? 'Unsaved changes' : savedFlash;

  return (
    <div className="ta-page final-reviews frd">
      <header className="ta-page__topbar">
        <div className="ta-page__heading frd__heading">
          <button type="button" className="frd__back" onClick={() => navigate('/app/ta-review/final-reviews')}>
            <ArrowLeft size={16} /> All reviews
          </button>
          <h2 className="ta-page__title"><CalendarCheck size={20} /> {detail.project.name ?? 'Team review'}</h2>
          <span className="fr-badge">{roleLabel[viewerRole]}</span>
        </div>
        <div className="ta-page__topbar-actions">
          {detail.review_zoom_url && (
            <a className="fr-day__zoom" href={detail.review_zoom_url} target="_blank" rel="noreferrer">
              <Video size={14} /> Join Zoom
            </a>
          )}
        </div>
      </header>

      <div className="frd__meta">
        <span className="frd__meta-item">
          {slot ? `${formatReviewDay(slot)} · ${formatReviewTime(slot)}` : 'Not scheduled'}
        </span>
        <span className="frd__meta-item">
          Home TA: <strong>{detail.home_ta?.name ?? '—'}</strong>
        </span>
        <span className="frd__meta-item">
          Review TA: <strong>{detail.review_ta?.name ?? 'Open'}</strong>
        </span>
      </div>

      {actionError && (
        <div className="fr-error" role="alert">
          <span>{actionError}</span>
          <button type="button" className="fr-error__close" onClick={() => setActionError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Scores ─────────────────────────────────────────────── */}
      <section className="frd__card">
        <div className="frd__card-head">
          <h3 className="frd__card-title">Scores</h3>
          <span className="frd__card-hint">1.0–5.0 in steps of 0.1 · Home TA scores product / team / scrum; Review TA and instructor give one overall.</span>
        </div>

        <div className="frd__grid-wrap">
          <div className="frd__grid-scroll">
            <table className="frd__grid">
              <thead>
                <tr className="frd__grid-groups">
                  <th />
                  <th colSpan={3} className={canEditHome ? 'frd__col--editable' : ''}>Home TA</th>
                  <th className={canEditReview ? 'frd__col--editable' : ''}>Review TA</th>
                  <th className={canEditInstructor ? 'frd__col--editable' : ''}>Instructor</th>
                  {noteRole && <th>Note ({noteRole === 'instructor' ? 'Prof' : noteRole === 'home' ? 'Home' : 'Review'})</th>}
                </tr>
                <tr>
                  <th className="frd__col-student">Student</th>
                  <th>Product</th>
                  <th>Team</th>
                  <th>Scrum</th>
                  <th>Overall</th>
                  <th>Overall</th>
                  {noteRole && <th className="frd__col-note">Optional note</th>}
                </tr>
                {(canEditHome || canEditReview || canEditInstructor) && (
                  <tr className="frd__setall">
                    <th className="frd__setall-label">Set all ↓</th>
                    {(['product', 'team', 'scrum'] as const).map((f) => {
                      const col: SetAllColumn = f === 'product' ? 'home-product' : f === 'team' ? 'home-team' : 'home-scrum';
                      return (
                        <th key={f}>
                          {canEditHome ? (
                            <span className="frd__setall-control">
                              <ScoreInput
                                value={setAllDraft[col] ?? ''}
                                label={`Set all ${f}`}
                                disabled={saving}
                                onChange={(v) => setSetAllDraft((prev) => ({ ...prev, [col]: v }))}
                                onEnter={() => applyColumn(col)}
                              />
                              <button
                                type="button"
                                className="frd__setall-apply"
                                title={`Apply to ${f} column`}
                                aria-label={`Apply to ${f} column`}
                                disabled={saving || !(setAllDraft[col] ?? '').trim()}
                                onClick={() => applyColumn(col)}
                              >
                                <Check size={13} />
                              </button>
                            </span>
                          ) : null}
                        </th>
                      );
                    })}
                    <th>
                      {canEditReview ? (
                        <span className="frd__setall-control">
                          <ScoreInput
                            value={setAllDraft.review ?? ''}
                            label="Set all review overall"
                            disabled={saving}
                            onChange={(v) => setSetAllDraft((prev) => ({ ...prev, review: v }))}
                            onEnter={() => applyColumn('review')}
                          />
                          <button
                            type="button"
                            className="frd__setall-apply"
                            title="Apply to review overall column"
                            aria-label="Apply to review overall column"
                            disabled={saving || !(setAllDraft.review ?? '').trim()}
                            onClick={() => applyColumn('review')}
                          >
                            <Check size={13} />
                          </button>
                        </span>
                      ) : null}
                    </th>
                    <th>
                      {canEditInstructor ? (
                        <span className="frd__setall-control">
                          <ScoreInput
                            value={setAllDraft.instructor ?? ''}
                            label="Set all instructor overall"
                            disabled={saving}
                            onChange={(v) => setSetAllDraft((prev) => ({ ...prev, instructor: v }))}
                            onEnter={() => applyColumn('instructor')}
                          />
                          <button
                            type="button"
                            className="frd__setall-apply"
                            title="Apply to instructor overall column"
                            aria-label="Apply to instructor overall column"
                            disabled={saving || !(setAllDraft.instructor ?? '').trim()}
                            onClick={() => applyColumn('instructor')}
                          >
                            <Check size={13} />
                          </button>
                        </span>
                      ) : null}
                    </th>
                    {noteRole && <th />}
                  </tr>
                )}
              </thead>
              <tbody>
                {detail.members.map((m) => {
                  const h = homeDraft[m.user_id] ?? { product: '', team: '', scrum: '', notes: '' };
                  const r = reviewDraft[m.user_id] ?? { overall: '', notes: '' };
                  const p = instrDraft[m.user_id] ?? { overall: '', notes: '' };
                  const extraNotes = otherRoleNotes(m.user_id);
                  const noteDraftValue = noteRole === 'home' ? h.notes : noteRole === 'review' ? r.notes : p.notes;
                  const homeRowIncomplete = homeIncompleteMembers.has(m.user_id);
                  const rowClearBlocked = noteBlockedMembers.has(m.user_id);
                  return (
                    <tr key={m.user_id}>
                      <td className="frd__col-student">
                        <span className="frd__student">
                          <Avatar name={m.name ?? 'Student'} email={m.email} />
                          <span className="frd__student-name">{m.name ?? m.email ?? 'Student'}</span>
                        </span>
                        {extraNotes.length > 0 && (
                          <span className="frd__other-notes">
                            {extraNotes.map((n) => (
                              <span key={n.label} className="frd__other-note">{n.label}: {n.text}</span>
                            ))}
                          </span>
                        )}
                        {rowClearBlocked && (
                          <span className="frd__clear-blocked">Clear blocked: remove or save the note first</span>
                        )}
                      </td>
                      {(['product', 'team', 'scrum'] as const).map((f) => (
                        <td key={f}>
                          {canEditHome ? (
                            <ScoreInput
                              value={h[f]}
                              label={`${f} for ${m.name}`}
                              disabled={saving}
                              invalid={homeRowIncomplete && h[f].trim() === ''}
                              onChange={(v) => setHomeField(m.user_id, f, v)}
                            />
                          ) : (
                            <span className="frd__score-read">{num(savedRow('home', m.user_id)?.[f] ?? null) || '–'}</span>
                          )}
                        </td>
                      ))}
                      <td>
                        {canEditReview ? (
                          <ScoreInput value={r.overall} label={`Review overall for ${m.name}`} disabled={saving}
                            onChange={(v) => setOverallField('review', m.user_id, 'overall', v)} />
                        ) : (
                          <span className="frd__score-read">{num(savedRow('review', m.user_id)?.overall ?? null) || '–'}</span>
                        )}
                      </td>
                      <td>
                        {canEditInstructor ? (
                          <ScoreInput value={p.overall} label={`Instructor overall for ${m.name}`} disabled={saving}
                            onChange={(v) => setOverallField('instructor', m.user_id, 'overall', v)} />
                        ) : (
                          <span className="frd__score-read">{num(savedRow('instructor', m.user_id)?.overall ?? null) || '–'}</span>
                        )}
                      </td>
                      {noteRole && (
                        <td className="frd__col-note">
                          <input
                            type="text"
                            className="frd__note-input"
                            placeholder="Optional note"
                            aria-label={`Note for ${m.name}`}
                            value={noteDraftValue}
                            disabled={saving}
                            onChange={(e) => {
                              if (noteRole === 'home') setHomeField(m.user_id, 'notes', e.target.value);
                              else setOverallField(noteRole, m.user_id, 'notes', e.target.value);
                            }}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="frd__avg">
                  <td className="frd__col-student">Team average (saved)</td>
                  {(['product', 'team', 'scrum'] as const).map((f) => (
                    <td key={f}>{teamAverage(detail.members.map((m) => savedRow('home', m.user_id)?.[f]))}</td>
                  ))}
                  <td>{teamAverage(detail.members.map((m) => savedRow('review', m.user_id)?.overall))}</td>
                  <td>{teamAverage(detail.members.map((m) => savedRow('instructor', m.user_id)?.overall))}</td>
                  {noteRole && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="frd__grid-fade" aria-hidden="true" />
        </div>
      </section>

      {/* ── Review notes ───────────────────────────────────────── */}
      <section className="frd__card">
        <div className="frd__card-head">
          <h3 className="frd__card-title"><ClipboardList size={17} /> Review notes</h3>
          <span className="frd__card-hint">
            {canEditNotes
              ? 'The Review TA’s worksheet — filled during the review session.'
              : 'Filled by the team’s Review TA.'}
            {detail.notes?.updated_at && ` Last saved ${new Date(detail.notes.updated_at).toLocaleString()}.`}
          </span>
        </div>

        {FINAL_REVIEW_SECTIONS.map((section) => (
          <div key={section.key} className="frd__section">
            <h4 className="frd__section-title">{section.title}</h4>
            {section.hint && <p className="frd__section-hint">{section.hint}</p>}
            {section.fields.map((f) => (
              <label key={f.key} className="frd__field">
                <span className="frd__field-label">{f.label}</span>
                {canEditNotes ? (
                  <textarea
                    className="frd__textarea"
                    rows={3}
                    placeholder={f.placeholder}
                    value={notesDraft[f.key] ?? ''}
                    disabled={saving}
                    onChange={(e) => { setNotesDraft((prev) => ({ ...prev, [f.key]: e.target.value })); touchNotes(); }}
                  />
                ) : (
                  <span className="frd__field-read">{(notesDraft[f.key] ?? '').trim() || '—'}</span>
                )}
              </label>
            ))}
            {section.memberContributions && detail.members.map((m) => (
              <label key={m.user_id} className="frd__field frd__field--member">
                <span className="frd__field-label">
                  <Avatar name={m.name ?? 'Student'} email={m.email} /> {m.name ?? m.email}
                </span>
                {canEditNotes ? (
                  <textarea
                    className="frd__textarea"
                    rows={2}
                    placeholder="What did they build / own?"
                    value={memberDraft[m.user_id] ?? ''}
                    disabled={saving}
                    onChange={(e) => { setMemberDraft((prev) => ({ ...prev, [m.user_id]: e.target.value })); touchNotes(); }}
                  />
                ) : (
                  <span className="frd__field-read">{(memberDraft[m.user_id] ?? '').trim() || '—'}</span>
                )}
              </label>
            ))}
          </div>
        ))}
      </section>

      {showSavebar && (
        <div className="frd__savebar">
          <span className="frd__savebar-msg" role="status">{savebarMessage}</span>

          {undoColumn && (
            <span className="frd__savebar-undo">
              {COLUMN_LABELS[undoColumn]} applied to everyone.
              <button type="button" className="frd__undo-btn" onClick={undoColumnApply}>Undo</button>
            </span>
          )}

          {showCombined ? (
            <button type="button" className="fr-btn fr-btn--primary" disabled={saving} onClick={() => void handleSaveAll()}>
              {saving ? 'Saving…' : 'Save all'}
            </button>
          ) : (
            <>
              {showScoresBtn && (
                <button
                  type="button"
                  className="fr-btn fr-btn--primary"
                  disabled={saving || scoresBlocked}
                  onClick={() => void handleSaveScores()}
                >
                  {saving ? 'Saving…' : 'Save scores'}
                </button>
              )}
              {showNotesBtn && (
                <button type="button" className="fr-btn fr-btn--primary" disabled={saving} onClick={() => void handleSaveNotes()}>
                  {saving ? 'Saving…' : 'Save notes'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FinalReviewDetail;

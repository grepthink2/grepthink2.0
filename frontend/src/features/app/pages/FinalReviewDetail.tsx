import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, ClipboardList, Video, X } from 'lucide-react';
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
import '../components/TAManagement/TAManagement.scss';
import './FinalReviews.scss';
import './FinalReviewDetail.scss';

/** Per-student draft of one scorer role's inputs (strings while typing). */
type HomeDraft = { product: string; team: string; scrum: string; notes: string };
type OverallDraft = { overall: string; notes: string };

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
}> = ({ value, onChange, label, disabled }) => (
  <input
    type="number"
    className="frd__score-input"
    min={1}
    max={5}
    step={0.1}
    inputMode="decimal"
    placeholder="–"
    aria-label={label}
    value={value}
    disabled={disabled}
    onChange={(e) => onChange(e.target.value)}
  />
);

const FinalReviewDetail: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<ApiFinalReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [homeDraft, setHomeDraft] = useState<Record<string, HomeDraft>>({});
  const [reviewDraft, setReviewDraft] = useState<Record<string, OverallDraft>>({});
  const [instrDraft, setInstrDraft] = useState<Record<string, OverallDraft>>({});
  const [scoresDirty, setScoresDirty] = useState(false);

  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [memberDraft, setMemberDraft] = useState<Record<string, string>>({});
  const [notesDirty, setNotesDirty] = useState(false);

  /** Drafts for the "Set all" header inputs (one per numeric column). */
  const [setAllDraft, setSetAllDraft] = useState<Record<string, string>>({});

  const seedDrafts = useCallback((d: ApiFinalReviewDetail) => {
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
    setSetAllDraft({});
  }, []);

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
    touchScores();
  };
  const setOverallField = (
    role: 'review' | 'instructor', sid: string, field: keyof OverallDraft, value: string,
  ) => {
    const setter = role === 'review' ? setReviewDraft : setInstrDraft;
    setter((prev) => ({ ...prev, [sid]: { ...prev[sid], [field]: value } }));
    touchScores();
  };

  /** "Set all" — copy one value into a column for every student. */
  const applyToAll = (apply: (sid: string) => void) => {
    detail?.members.forEach((m) => apply(m.user_id));
    touchScores();
  };

  const teamAverage = (values: (number | null | undefined)[]): string => {
    const nums = values.filter((v): v is number => typeof v === 'number');
    if (!nums.length) return '–';
    return (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(1);
  };

  const savedRow = (role: FinalReviewScoreRole, sid: string) =>
    detail?.scores.find((s) => s.role === role && s.student_id === sid);

  const handleSaveScores = async () => {
    if (!detail || !projectId) return;
    setActionError(null);

    const jobs: { role: FinalReviewScoreRole; entries: FinalReviewScoreEntry[] }[] = [];
    const nameOf = (sid: string) =>
      detail.members.find((m) => m.user_id === sid)?.name ?? 'a student';

    if (canEditHome) {
      const entries: FinalReviewScoreEntry[] = [];
      for (const m of detail.members) {
        const d = homeDraft[m.user_id];
        if (!d) continue;
        const filled = [d.product, d.team, d.scrum].filter((v) => v.trim() !== '').length;
        if (filled === 0) continue;
        if (filled < 3) {
          setActionError(`Home TA scores for ${nameOf(m.user_id)} need product, team AND scrum.`);
          return;
        }
        const product = parseScore(d.product);
        const team = parseScore(d.team);
        const scrum = parseScore(d.scrum);
        if ([product, team, scrum].some((v) => Number.isNaN(v))) {
          setActionError(`Scores for ${nameOf(m.user_id)} must be between 1.0 and 5.0.`);
          return;
        }
        entries.push({
          student_id: m.user_id, product, team, scrum,
          notes: d.notes.trim() || null,
        });
      }
      if (entries.length) jobs.push({ role: 'home', entries });
    }

    for (const role of ['review', 'instructor'] as const) {
      if (role === 'review' ? !canEditReview : !canEditInstructor) continue;
      const draft = role === 'review' ? reviewDraft : instrDraft;
      const entries: FinalReviewScoreEntry[] = [];
      for (const m of detail.members) {
        const d = draft[m.user_id];
        if (!d || d.overall.trim() === '') continue;
        const overall = parseScore(d.overall);
        if (Number.isNaN(overall)) {
          setActionError(`Overall for ${nameOf(m.user_id)} must be between 1.0 and 5.0.`);
          return;
        }
        entries.push({ student_id: m.user_id, overall, notes: d.notes.trim() || null });
      }
      if (entries.length) jobs.push({ role, entries });
    }

    if (!jobs.length) {
      setActionError('Nothing to save yet — enter at least one score.');
      return;
    }

    setSaving(true);
    try {
      for (const job of jobs) {
        await api.saveFinalReviewScores(projectId, job.role, job.entries);
      }
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
    // Preserve any keys this template version doesn't know about.
    const content: Record<string, unknown> = { ...(detail.notes?.content ?? {}) };
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

    setSaving(true);
    try {
      await api.saveFinalReviewNotes(projectId, content, FINAL_REVIEW_TEMPLATE_VERSION);
      await loadDetail();
      setSavedFlash('Notes saved');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to save notes');
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
    return <div className="ta-page final-reviews"><div className="ta-page__empty"><p>Loading…</p></div></div>;
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
                  {(['product', 'team', 'scrum'] as const).map((f) => (
                    <th key={f}>
                      {canEditHome ? (
                        <ScoreInput
                          value={setAllDraft[`home-${f}`] ?? ''}
                          label={`Set all ${f}`}
                          onChange={(v) => {
                            setSetAllDraft((prev) => ({ ...prev, [`home-${f}`]: v }));
                            applyToAll((sid) => setHomeDraft((prev) => ({ ...prev, [sid]: { ...prev[sid], [f]: v } })));
                          }}
                        />
                      ) : null}
                    </th>
                  ))}
                  <th>
                    {canEditReview ? (
                      <ScoreInput
                        value={setAllDraft.review ?? ''}
                        label="Set all review overall"
                        onChange={(v) => {
                          setSetAllDraft((prev) => ({ ...prev, review: v }));
                          applyToAll((sid) => setReviewDraft((prev) => ({ ...prev, [sid]: { ...prev[sid], overall: v } })));
                        }}
                      />
                    ) : null}
                  </th>
                  <th>
                    {canEditInstructor ? (
                      <ScoreInput
                        value={setAllDraft.instructor ?? ''}
                        label="Set all instructor overall"
                        onChange={(v) => {
                          setSetAllDraft((prev) => ({ ...prev, instructor: v }));
                          applyToAll((sid) => setInstrDraft((prev) => ({ ...prev, [sid]: { ...prev[sid], overall: v } })));
                        }}
                      />
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
                    </td>
                    {(['product', 'team', 'scrum'] as const).map((f) => (
                      <td key={f}>
                        {canEditHome ? (
                          <ScoreInput value={h[f]} label={`${f} for ${m.name}`} disabled={saving}
                            onChange={(v) => setHomeField(m.user_id, f, v)} />
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

        {(canEditHome || canEditReview || canEditInstructor) && (
          <div className="frd__card-actions">
            {savedFlash === 'Scores saved' && !scoresDirty && <span className="frd__saved">Saved ✓</span>}
            <button type="button" className="fr-btn fr-btn--primary" disabled={saving || !scoresDirty} onClick={() => void handleSaveScores()}>
              {saving ? 'Saving…' : 'Save scores'}
            </button>
          </div>
        )}
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

        {canEditNotes && (
          <div className="frd__card-actions">
            {savedFlash === 'Notes saved' && !notesDirty && <span className="frd__saved">Saved ✓</span>}
            <button type="button" className="fr-btn fr-btn--primary" disabled={saving || !notesDirty} onClick={() => void handleSaveNotes()}>
              {saving ? 'Saving…' : 'Save notes'}
            </button>
          </div>
        )}
      </section>

      {(scoresDirty || notesDirty) && (
        <div className="frd__savebar">
          <span className="frd__savebar-msg">Unsaved changes</span>
          {scoresDirty && (canEditHome || canEditReview || canEditInstructor) && (
            <button type="button" className="fr-btn fr-btn--primary" disabled={saving} onClick={() => void handleSaveScores()}>
              Save scores
            </button>
          )}
          {notesDirty && canEditNotes && (
            <button type="button" className="fr-btn fr-btn--primary" disabled={saving} onClick={() => void handleSaveNotes()}>
              Save notes
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FinalReviewDetail;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/lib/auth';
import { api } from '@/lib/api';
import type { ApiStaffingSubmission, SubmitInterestFormPayload } from '@/lib/api';
import type {
  InterestFormAssignment,
  InterestFormState,
  MockProject,
  MockStudent,
  ProjectChoice,
  ProjectSlots,
} from './interestTypes';
import { clearDraft, loadDraft, saveDraft } from './draftStorage';
import ProjectInterestsSection from './sections/ProjectInterestsSection';
import PreviousProjectSection from './sections/PreviousProjectSection';
import TeamPreferencesSection from './sections/TeamPreferencesSection';
import NotesSection from './sections/NotesSection';
import SubmittedConfirmation from './SubmittedConfirmation';
import './InterestForm.scss';

export type { InterestFormAssignment };

const EMPTY_SLOTS: ProjectSlots = [null, null, null, null, null];

const defaultForm = (): InterestFormState => ({
  projectSlots:        [...EMPTY_SLOTS] as ProjectSlots,
  previousProject:     '',
  previousProjectLink: '',
  taking115c:          null,
  workWith:            [],
  dontWorkWith:        [],
  notes:               '',
});

interface InterestFormProps {
  assignment: InterestFormAssignment;
}

/**
 * Map the server's full-submission payload into the local form state.
 * Always returns 5 slots (padded with null) to keep the slot UI consistent.
 */
function fromSubmission(sub: ApiStaffingSubmission): InterestFormState {
  const ranked = (sub.ranked_projects ?? []).slice(0, 5);
  const slots: ProjectSlots = [...EMPTY_SLOTS] as ProjectSlots;
  ranked.forEach((row, idx) => {
    slots[idx] = {
      projectId:   row.project_id,
      projectName: row.project_name ?? 'Project',
      reasoning:   row.interest_reason ?? '',
    };
  });
  return {
    projectSlots:        slots,
    previousProject:     sub.previous_project_name ?? '',
    previousProjectLink: sub.previous_project_link ?? '',
    taking115c:          sub.taking_115c,
    workWith: (sub.work_with ?? []).map((p) => ({
      id:    p.user_id,
      name:  p.name ?? p.email ?? 'Classmate',
      email: p.email ?? undefined,
    })),
    dontWorkWith: (sub.dont_work_with ?? []).map((p) => ({
      id:    p.user_id,
      name:  p.name ?? p.email ?? 'Classmate',
      email: p.email ?? undefined,
    })),
    notes: sub.notes ?? '',
  };
}

const InterestForm: React.FC<InterestFormProps> = ({ assignment }) => {
  const navigate = useNavigate();
  const { user } = useUser();
  const classId = assignment.classId;

  const [form, setForm] = useState<InterestFormState>(
    () => loadDraft(assignment.id) ?? defaultForm(),
  );
  const [submitted, setSubmitted]       = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState<string | null>(null);

  // Roster data loaded from the backend so the dropdowns reflect this class.
  const [projects, setProjects] = useState<MockProject[]>([]);
  const [students, setStudents] = useState<MockStudent[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch projects + classmates + existing submission whenever the class changes.
  // The existing submission (if any) takes precedence over the local draft so a
  // user that already submitted sees their answers reflected exactly.
  useEffect(() => {
    if (!classId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [projRes, studRes, subRes] = await Promise.all([
          api.getClassProjects(classId),
          api.getClassStudents(classId),
          api.getMyInterestSubmission(classId).catch(() => null),
        ]);
        if (cancelled) return;

        setProjects(
          projRes.projects.map((p) => ({
            id:          p.id,
            name:        p.name,
            description: p.description,
          })),
        );
        setStudents(
          studRes.students
            // Hide the current user from peer-preference dropdowns.
            .filter((s) => s.id !== user?.id)
            .map((s) => ({
              id:    s.id,
              name:  s.email ?? 'Classmate',
              email: s.email,
            })),
        );

        const sub = subRes?.submission;
        // Prefer a real prior submission over the local draft.
        if (sub && sub.submitted_at) {
          setForm(fromSubmission(sub));
          setSubmitted(true);
        } else if (sub && (sub.ranked_projects?.length || sub.notes)) {
          setForm(fromSubmission(sub));
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Failed to load form',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, user?.id]);

  // Auto-save draft on every change so refreshes don't lose work.
  useEffect(() => {
    saveDraft(assignment.id, form);
  }, [form, assignment.id]);

  // ── Project slot handlers ───────────────────────────────────────
  const handleSlotSelect = useCallback((index: number, choice: ProjectChoice) => {
    setForm((prev) => {
      const next = [...prev.projectSlots] as ProjectSlots;
      next[index] = choice;
      return { ...prev, projectSlots: next };
    });
  }, []);

  const handleSlotClear = useCallback((index: number) => {
    setForm((prev) => {
      const next = [...prev.projectSlots] as ProjectSlots;
      next[index] = null;
      return { ...prev, projectSlots: next };
    });
  }, []);

  const handleSlotReasoning = useCallback((index: number, reasoning: string) => {
    setForm((prev) => {
      const next = [...prev.projectSlots] as ProjectSlots;
      const slot = next[index];
      if (slot) next[index] = { ...slot, reasoning };
      return { ...prev, projectSlots: next };
    });
  }, []);

  // ── Team preference handlers ────────────────────────────────────
  const handleAddWorkWith        = (s: MockStudent) => setForm((p) => ({ ...p, workWith: [...p.workWith, s] }));
  const handleRemoveWorkWith     = (id: string)     => setForm((p) => ({ ...p, workWith: p.workWith.filter((s) => s.id !== id) }));
  const handleAddDontWorkWith    = (s: MockStudent) => setForm((p) => ({ ...p, dontWorkWith: [...p.dontWorkWith, s] }));
  const handleRemoveDontWorkWith = (id: string)     => setForm((p) => ({ ...p, dontWorkWith: p.dontWorkWith.filter((s) => s.id !== id) }));

  // A student picked in one list shouldn't appear in the other.
  const workWithOptions     = students.filter((s) => !form.dontWorkWith.some((d) => d.id === s.id));
  const dontWorkWithOptions = students.filter((s) => !form.workWith.some((w) => w.id === s.id));

  // ── Validation ──────────────────────────────────────────────────
  const isValid = useMemo(() => {
    const allSlotsFilled = form.projectSlots.every(
      (s) => s !== null && s.reasoning.trim().length > 0,
    );
    return (
      allSlotsFilled &&
      form.previousProject.trim().length > 0 &&
      form.taking115c !== null
    );
  }, [form]);

  // ── Submit ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!classId) {
      setSubmitError('No class selected for this assignment.');
      return;
    }
    if (!isValid) {
      setSubmitError('Please complete all required fields before submitting.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    // Highest interest = #1 slot; the spreadsheet uses 5 = top, so we
    // map slot 0 -> 5, slot 1 -> 4, ... slot 4 -> 1. This matches the
    // controller's expectation that interest_value 5 is the top choice.
    const ranked = form.projectSlots
      .map((slot, idx) => ({ slot, idx }))
      .filter((x): x is { slot: ProjectChoice; idx: number } => x.slot !== null)
      .map(({ slot, idx }) => ({
        project_id:      slot.projectId,
        interest_value:  Math.max(5 - idx, 1),
        interest_reason: slot.reasoning.trim() || null,
      }));

    const payload: SubmitInterestFormPayload = {
      taking_115c:           form.taking115c,
      previous_project_name: form.previousProject.trim() || null,
      previous_project_link: form.previousProjectLink.trim() || null,
      notes:                 form.notes.trim() || null,
      ranked_projects:       ranked,
      work_with:             form.workWith.map((s) => s.id),
      dont_work_with:        form.dontWorkWith.map((s) => s.id),
      submitted:             true,
    };

    try {
      await api.submitInterestForm(classId, payload);
      clearDraft(assignment.id);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to submit. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="interest-form">
        <div className="if-shell">
          <p>Loading interest form…</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="interest-form">
        <div className="if-shell">
          <p className="interest-form__error">{loadError}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <SubmittedConfirmation
        assignmentName={assignment.name}
        onEdit={() => { setSubmitted(false); }}
        onBackToAssignments={() => navigate('/app/assignments')}
      />
    );
  }

  return (
    <div className="interest-form">
      <div className="if-shell">
        <ProjectInterestsSection
          slots={form.projectSlots}
          projects={projects}
          onSlotSelect={handleSlotSelect}
          onSlotClear={handleSlotClear}
          onSlotReasoning={handleSlotReasoning}
        />

        <PreviousProjectSection
          projectName={form.previousProject}
          projectLink={form.previousProjectLink}
          onProjectNameChange={(v) => setForm((p) => ({ ...p, previousProject: v }))}
          onProjectLinkChange={(v) => setForm((p) => ({ ...p, previousProjectLink: v }))}
        />

        <TeamPreferencesSection
          taking115c={form.taking115c}
          workWith={form.workWith}
          dontWorkWith={form.dontWorkWith}
          workWithOptions={workWithOptions}
          dontWorkWithOptions={dontWorkWithOptions}
          onTaking115cChange={(v) => setForm((p) => ({ ...p, taking115c: v }))}
          onAddWorkWith={handleAddWorkWith}
          onRemoveWorkWith={handleRemoveWorkWith}
          onAddDontWorkWith={handleAddDontWorkWith}
          onRemoveDontWorkWith={handleRemoveDontWorkWith}
        />

        <NotesSection
          value={form.notes}
          onChange={(v) => setForm((p) => ({ ...p, notes: v }))}
        />

        <footer className="if-footer">
          {submitError && <p className="interest-form__error">{submitError}</p>}
          <div className="if-footer__actions">
            <button
              type="button"
              className="tsrs-btn tsrs-btn--primary"
              onClick={handleSubmit}
              disabled={isSubmitting || !isValid}
              title={!isValid ? 'Complete all required fields to submit' : undefined}
            >
              {isSubmitting ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default InterestForm;

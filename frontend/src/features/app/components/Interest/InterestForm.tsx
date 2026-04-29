import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  InterestFormAssignment,
  InterestFormState,
  MockStudent,
  ProjectChoice,
  ProjectSlots,
} from './interestTypes';
import { MOCK_STUDENTS } from './interestTypes';
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

const InterestForm: React.FC<InterestFormProps> = ({ assignment }) => {
  const navigate = useNavigate();

  const [form, setForm] = useState<InterestFormState>(
    () => loadDraft(assignment.id) ?? defaultForm(),
  );
  const [submitted, setSubmitted]       = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError]   = useState<string | null>(null);

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
  const workWithOptions     = MOCK_STUDENTS.filter((s) => !form.dontWorkWith.some((d) => d.id === s.id));
  const dontWorkWithOptions = MOCK_STUDENTS.filter((s) => !form.workWith.some((w) => w.id === s.id));

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
    if (!isValid) {
      setSubmitError('Please complete all required fields before submitting.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await new Promise((r) => setTimeout(r, 600));
      clearDraft(assignment.id);
      setSubmitted(true);
    } catch {
      setSubmitError('Failed to submit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SubmittedConfirmation
        assignmentName={assignment.name}
        onEdit={() => { setSubmitted(false); setForm(defaultForm()); }}
        onBackToAssignments={() => navigate('/app/assignments')}
      />
    );
  }

  return (
    <div className="interest-form">
      <div className="if-shell">
        <ProjectInterestsSection
          slots={form.projectSlots}
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

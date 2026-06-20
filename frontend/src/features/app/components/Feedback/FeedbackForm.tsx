import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import type { SubmitFeedbackPayload } from '@/lib/api';
import './FeedbackForm.scss';

export interface FeedbackFormAssignment {
  id: string;
  name: string;
  dueDate: string;
  classId: string;
}

const QUESTIONS: { key: keyof SubmitFeedbackPayload; label: string; placeholder: string }[] = [
  {
    key: 'q1_liked',
    label: 'What did you like most about using GrepThink this term?',
    placeholder: 'Share what worked well for you...',
  },
  {
    key: 'q2_frustrating',
    label: 'What was the most frustrating or confusing part of the app?',
    placeholder: 'Describe any pain points...',
  },
  {
    key: 'q3_missing_feature',
    label: "Was there a feature you expected but didn't find?",
    placeholder: 'Describe the feature you expected...',
  },
  {
    key: 'q4_bugs',
    label: 'Any bugs or issues you ran into that we should know about?',
    placeholder: 'Describe any bugs or unexpected behavior...',
  },
  {
    key: 'q5_suggestions',
    label: "Anything else you'd change or suggest?",
    placeholder: 'Any other thoughts or suggestions...',
  },
];

const EMPTY_FORM: SubmitFeedbackPayload = {
  q1_liked: '',
  q2_frustrating: '',
  q3_missing_feature: '',
  q4_bugs: '',
  q5_suggestions: '',
};

interface FeedbackFormProps {
  assignment: FeedbackFormAssignment;
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({ assignment }) => {
  const navigate = useNavigate();
  const [form, setForm] = useState<SubmitFeedbackPayload>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getMyFeedback(assignment.id)
      .then(({ submission }) => {
        if (cancelled || !submission) return;
        setForm({
          q1_liked: submission.q1_liked,
          q2_frustrating: submission.q2_frustrating,
          q3_missing_feature: submission.q3_missing_feature,
          q4_bugs: submission.q4_bugs,
          q5_suggestions: submission.q5_suggestions,
        });
        setIsEditMode(true);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assignment.id]);

  const handleChange = (key: keyof SubmitFeedbackPayload, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setJustSubmitted(false);
  };

  const isValid = Object.values(form).every((v) => v.trim().length > 0);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await api.submitFeedback(assignment.id, form);
      setJustSubmitted(true);
      setIsEditMode(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="feedback-form feedback-form--loading">Loading…</div>;
  }

  return (
    <div className="feedback-form">
      <div className="feedback-form__header">
        <button
          type="button"
          className="feedback-form__back"
          onClick={() => navigate('/app/assignments')}
        >
          ← Back to Assignments
        </button>
        <h1 className="feedback-form__title">{assignment.name}</h1>
        <p className="feedback-form__due">Due {assignment.dueDate}</p>
      </div>

      {justSubmitted && (
        <div className="feedback-form__banner">
          {isEditMode ? 'Feedback updated!' : 'Feedback submitted!'} You can still edit your responses below.
        </div>
      )}

      <div className="feedback-form__questions">
        {QUESTIONS.map(({ key, label, placeholder }, idx) => (
          <div className="feedback-form__question" key={key}>
            <label className="feedback-form__label" htmlFor={key}>
              {idx + 1}. {label}
            </label>
            <textarea
              id={key}
              className="feedback-form__textarea"
              rows={4}
              placeholder={placeholder}
              value={form[key]}
              onChange={(e) => handleChange(key, e.target.value)}
            />
          </div>
        ))}
      </div>

      {error && <p className="feedback-form__error">{error}</p>}

      <div className="feedback-form__actions">
        <button
          type="button"
          className="feedback-form__submit"
          onClick={handleSubmit}
          disabled={submitting || !isValid}
        >
          {submitting ? 'Submitting…' : isEditMode ? 'Update Feedback' : 'Submit Feedback'}
        </button>
      </div>
    </div>
  );
};

export default FeedbackForm;

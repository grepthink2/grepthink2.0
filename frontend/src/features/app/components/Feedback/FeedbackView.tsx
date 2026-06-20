import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { ApiFeedbackSubmission } from '@/lib/api';
import './FeedbackView.scss';

const QUESTIONS: { key: keyof ApiFeedbackSubmission; label: string }[] = [
  { key: 'q1_liked',           label: 'What did you like most?' },
  { key: 'q2_frustrating',     label: 'Most frustrating or confusing?' },
  { key: 'q3_missing_feature', label: 'Feature expected but not found?' },
  { key: 'q4_bugs',            label: 'Bugs or issues?' },
  { key: 'q5_suggestions',     label: 'Other suggestions?' },
];

interface FeedbackViewProps {
  assignmentId: string;
}

const FeedbackView: React.FC<FeedbackViewProps> = ({ assignmentId }) => {
  const [assignmentTitle, setAssignmentTitle] = useState('');
  const [submissions, setSubmissions] = useState<ApiFeedbackSubmission[]>([]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getFeedbackOverview(assignmentId)
      .then(({ assignment, submissions: subs, submitted_count, total_count }) => {
        if (cancelled) return;
        setAssignmentTitle(assignment.Title);
        setSubmissions(subs);
        setSubmittedCount(submitted_count);
        setTotalCount(total_count);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load responses');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assignmentId]);

  if (loading) return <div className="feedback-view feedback-view--loading">Loading responses…</div>;
  if (error)   return <div className="feedback-view feedback-view--error"><p>{error}</p></div>;

  return (
    <div className="feedback-view">
      <h1 className="feedback-view__title">{assignmentTitle}</h1>
      <p className="feedback-view__count">
        {submittedCount} of {totalCount} students responded
      </p>

      {submissions.length === 0 ? (
        <p className="feedback-view__empty">No responses yet.</p>
      ) : (
        <div className="feedback-view__table-card">
          <div className="feedback-view__table-wrapper">
            <table className="feedback-view__table">
              <thead>
                <tr>
                  <th className="feedback-view__th">Student</th>
                  {QUESTIONS.map((q) => (
                    <th key={q.key} className="feedback-view__th">{q.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr key={sub.id} className="feedback-view__row">
                    <td className="feedback-view__name">{sub.student_name || '—'}</td>
                    {QUESTIONS.map((q) => (
                      <td key={q.key} className="feedback-view__answer">
                        {(sub[q.key] as string) || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackView;

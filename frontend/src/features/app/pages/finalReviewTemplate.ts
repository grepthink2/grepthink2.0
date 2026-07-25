/**
 * The Review-TA notes worksheet template — the section/field structure of the
 * staff "Project Review Notes" doc, organized into Scope / Demo / Code / Team /
 * Scrum Process / Release Documents / Discussion / Comments.
 *
 * Answers are stored in `final_review_notes.content` keyed by `field.key`
 * (member contributions under `member_contributions[<user_id>]`). Bump
 * TEMPLATE_VERSION when keys change meaning.
 */

export const FINAL_REVIEW_TEMPLATE_VERSION = 1;

/** content key for the per-member contribution map. */
export const MEMBER_CONTRIBUTIONS_KEY = 'member_contributions';

export interface NotesField {
  key: string;
  label: string;
  placeholder?: string;
}

export interface NotesSection {
  key: string;
  title: string;
  hint?: string;
  fields: NotesField[];
  /** Render one contribution field per team member after `fields`. */
  memberContributions?: boolean;
}

export const FINAL_REVIEW_SECTIONS: NotesSection[] = [
  {
    key: 'scope',
    title: 'Scope',
    fields: [
      {
        key: 'project_scope',
        label: 'Project scope',
        placeholder: 'What the product is, MVP boundaries, special features…',
      },
    ],
  },
  {
    key: 'demo',
    title: 'Demo',
    fields: [
      {
        key: 'demo',
        label: 'Demo walkthrough',
        placeholder: 'What was shown, what worked, gaps vs. real-world usage…',
      },
    ],
  },
  {
    key: 'code',
    title: 'Code',
    fields: [
      {
        key: 'code_review',
        label: 'Code review',
        placeholder: 'Architecture, organization, readability, docs…',
      },
      {
        key: 'testing',
        label: 'Testing & CI/CD',
        placeholder: 'Unit / integration / e2e coverage, manual testing, pipelines…',
      },
    ],
  },
  {
    key: 'team',
    title: 'Team',
    hint: 'Contributions as presented during the review.',
    fields: [
      {
        key: 'contributions_overview',
        label: 'Overall contributions',
        placeholder: 'How balanced was the work? Anything notable?',
      },
    ],
    memberContributions: true,
  },
  {
    key: 'scrum',
    title: 'Scrum Process',
    hint: 'Plans, reports, and working agreements.',
    fields: [
      {
        key: 'process_overview',
        label: 'Scrum documents overview',
        placeholder: 'Overall state of the docs — burnup charts, consistency…',
      },
      { key: 'style_guides', label: 'Style guide(s)', placeholder: 'Present? Followed?' },
      { key: 'dod', label: 'Definition of Done', placeholder: 'Present? Actually used?' },
      { key: 'release_plan', label: 'Release Plan', placeholder: 'Quality, iteration, story points…' },
      { key: 'sprint_plan', label: 'Sprint Plan', placeholder: 'Task breakdown, estimates…' },
      { key: 'sprint_report', label: 'Sprint Report', placeholder: 'Retro quality, burnup charts, actions…' },
    ],
  },
  {
    key: 'release_docs',
    title: 'Release Documents',
    fields: [
      { key: 'test_plan_report', label: 'Test Plan & Report', placeholder: 'Present? One test per story?' },
      { key: 'release_summary', label: 'Release Summary', placeholder: 'Present? Accurate?' },
    ],
  },
  {
    key: 'discussion',
    title: 'Discussion',
    fields: [
      {
        key: 'discussion',
        label: 'Discussion with the team',
        placeholder: 'Understanding of the codebase, reflections…',
      },
      {
        key: 'ai_tools',
        label: 'Use of AI tools',
        placeholder: 'Which tools, how rigorously (rules/skills, review discipline)…',
      },
    ],
  },
  {
    key: 'comments',
    title: 'Comments',
    fields: [
      { key: 'comments', label: 'Closing comments', placeholder: 'Anything else worth recording…' },
    ],
  },
];

/** "Wednesday, July 22" (viewer's locale/timezone). */
export const formatReviewDay = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

/** "1:00 PM" (viewer's locale/timezone). */
export const formatReviewTime = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

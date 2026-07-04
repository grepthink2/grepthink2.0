import { format, parseISO } from 'date-fns';
import type { ApiAssignment, ApiProject, ApiRosterStudent } from '@/lib/api';
import type {
  ProjectHealthItem,
  HealthStatus,
} from '@features/app/components/Stats/ProjectHealth';

export type ProjectSentiment = 'positive' | 'neutral' | 'negative';

const SENTIMENT_TO_HEALTH: Record<ProjectSentiment, HealthStatus> = {
  positive: 'excellent',
  neutral: 'warning',
  negative: 'poor',
};

const HEALTH_DESCRIPTION: Record<ProjectSentiment, string> = {
  positive: 'Team sentiment is positive',
  neutral: 'Team sentiment is neutral',
  negative: 'Team sentiment is negative',
};

const SENTIMENT_SEVERITY: Record<ProjectSentiment, number> = {
  negative: 0,
  neutral: 1,
  positive: 2,
};

export function normalizeSentiment(raw: string | null | undefined): ProjectSentiment {
  if (raw === 'positive' || raw === 'neutral' || raw === 'negative') {
    return raw;
  }
  return 'neutral';
}

/**
 * Build ProjectHealth cards from API projects that carry a sentiment signal.
 * Mirrors the logic in pages/Projects.tsx so the dashboard shows the same data.
 */
export function buildProjectHealth(apiProjects: ApiProject[]): ProjectHealthItem[] {
  return apiProjects
    .filter((p) => p.sentiment)
    .map((p) => {
      const sentiment = normalizeSentiment(p.sentiment);
      return {
        order: SENTIMENT_SEVERITY[sentiment],
        item: {
          id: p.id,
          name: p.name,
          health: SENTIMENT_TO_HEALTH[sentiment],
          description: HEALTH_DESCRIPTION[sentiment],
          via: 'Team Sentiment',
        } satisfies ProjectHealthItem,
      };
    })
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

export type AssignmentStatus = 'draft' | 'active' | 'closed';

export interface DashboardAssignment {
  id: string;
  title: string;
  dueLabel: string;
  closeDate: string;
  status: AssignmentStatus;
  submitted: number;
  total: number;
  assignmentType?: string;
  hasTsrResponses: boolean;
  hasFeedbackResponses: boolean;
}

/** Map an API assignment to a dashboard row with a derived status pill. */
export function mapDashboardAssignment(a: ApiAssignment): DashboardAssignment {
  const today = format(new Date(), 'yyyy-MM-dd');
  let status: AssignmentStatus;
  if (a.status === 'draft') {
    status = 'draft';
  } else if (a.close_date < today) {
    status = 'closed';
  } else {
    status = 'active';
  }
  const isFeedback = a.assignment_type === 'feedback';
  return {
    id: a.id,
    title: a.Title,
    dueLabel: format(parseISO(a.close_date), 'MMM d, yyyy'),
    closeDate: a.close_date,
    status,
    submitted: isFeedback ? (a.feedback_submitted ?? 0) : (a.teams_submitted ?? 0),
    total: isFeedback ? (a.feedback_total ?? 0) : (a.teams_total ?? 0),
    assignmentType: a.assignment_type,
    hasTsrResponses: a.has_tsr_responses ?? false,
    hasFeedbackResponses: (a.feedback_submitted ?? 0) > 0,
  };
}

/** Soonest due first (by close date), limited to `limit`. */
export function recentAssignments(
  assignments: ApiAssignment[],
  limit = 3,
): DashboardAssignment[] {
  return assignments
    .map(mapDashboardAssignment)
    .sort((a, b) => a.closeDate.localeCompare(b.closeDate))
    .slice(0, limit);
}

export interface RosterBreakdown {
  registered: number;
  enrolled: number;
  waitlisted: number;
  notOnRoster: number;
  total: number;
}

/**
 * Count roster rows into the buckets the dashboard surfaces. TAs are overseers,
 * not part of the student population, so they're excluded from every bucket.
 */
export function summarizeRoster(students: ApiRosterStudent[]): RosterBreakdown {
  let registered = 0;
  let enrolled = 0;
  let waitlisted = 0;
  let notOnRoster = 0;

  const countable = students.filter((s) => s.enrollment_role !== 'ta');

  for (const s of countable) {
    if (s.grepthink_status === 'registered') registered += 1;
    if (s.class_status === 'enrolled') enrolled += 1;
    else if (s.class_status === 'waitlisted') waitlisted += 1;
    if (s.grepthink_status === 'registered' && s.class_status === 'not_on_roster') {
      notOnRoster += 1;
    }
  }

  return {
    registered,
    enrolled,
    waitlisted,
    notOnRoster,
    total: countable.length,
  };
}

/**
 * GET /api/schedule's answer as the schedule components read it: snake_case to the
 * `ScheduleItemData` contract, and each deadline's link for the lens it was answered for. The
 * endpoint sends ids, never paths, so the routes live here with the rest of the web client.
 */
import type { ApiSchedule, ApiScheduleItem, ApiScheduleLens, ApiSchedulePerson } from '@/lib/api';
import type { ScheduleItemData, SchedulePerson, ScheduleReviewer } from './scheduleModel';

/**
 * Where a deadline's title goes: the student's submission, a TA's TSR review, the instructor's view.
 * TA Review lists TSRs only (any other id falls back to the first TSR), so a TA's other deadlines
 * have no link.
 */
export function deadlineHref(lens: ApiScheduleLens, item: ApiScheduleItem): string | undefined {
  const id = item.assignment_id;
  if (!id) return undefined;
  if (lens === 'student') return `/app/assignments/${id}`;
  if (lens === 'ta') return item.assignment_type === 'tsr' ? `/app/ta-review/${id}` : undefined;
  if (item.assignment_type === 'tsr') return `/app/modules/tsr/${id}`;
  if (item.assignment_type === 'feedback') return `/app/modules/feedback/${id}`;
  return undefined; // an interest form has no instructor page of its own
}

function person(p: ApiSchedulePerson): SchedulePerson {
  const out: SchedulePerson = { id: p.id, name: p.name, you: p.you };
  if (p.avatar_url) out.avatarUrl = p.avatar_url;
  if (p.role) out.role = p.role;
  return out;
}

function reviewer(p: ApiSchedulePerson): ScheduleReviewer {
  return { ...person(p), slot: p.slot === 'review' ? 'review' : 'home' };
}

/** One answered item; keys the answer leaves out or sends as null stay off the result. */
export function toScheduleItem(lens: ApiScheduleLens, it: ApiScheduleItem): ScheduleItemData {
  const out: ScheduleItemData = {
    id: it.id,
    kind: it.kind,
    title: it.title,
    startsAt: it.starts_at,
    endsAt: it.ends_at,
    allDay: it.all_day,
  };
  if (it.all_day && it.date) out.date = it.date;
  if (it.project_id) out.projectId = it.project_id;
  if (it.team_name) out.teamName = it.team_name;
  if (it.location) out.location = it.location;
  if (it.zoom_url) out.zoomUrl = it.zoom_url;
  if (it.host) out.host = person(it.host);
  if (it.reviewers) out.reviewers = it.reviewers.map(reviewer);
  if (it.recurrence_label) out.recurrenceLabel = it.recurrence_label;
  if (it.meeting_index != null) out.meetingIndex = it.meeting_index;
  if (it.meetings_per_week != null) out.meetingsPerWeek = it.meetings_per_week;
  if (it.attendance != null) out.attendance = it.attendance;
  if (it.note) out.note = it.note;
  if (it.scope) out.scope = it.scope;
  if (it.sprint) out.sprint = it.sprint;
  if (it.kind === 'deadline') {
    const href = deadlineHref(lens, it);
    if (href) out.href = href;
  }
  return out;
}

export function toScheduleItems(answer: ApiSchedule): ScheduleItemData[] {
  return answer.items.map((it) => toScheduleItem(answer.lens, it));
}

import type { ApiScrumSprint } from '@/lib/api';
import { STATUS_LABELS } from '../utils/sprints';
import './SprintStatusPill.scss';

/** A sprint's status as a coloured pill: the board's sprint picker and the project page's sprint card. */
export default function SprintStatusPill({ status }: { status: ApiScrumSprint['status'] }) {
  return <span className={`sprint-status sprint-status--${status}`}>{STATUS_LABELS[status]}</span>;
}

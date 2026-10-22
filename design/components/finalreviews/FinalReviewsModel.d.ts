// Intentional addition: SLOT_MINUTES, SLOT_POST_MAX, FR_LENSES, FR_REASONS, FinalReviewsModel — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
/** Final-review slot sign-up (C2) — pure model. Shapes are the API's own (brief §8, frontend/src/lib/api/types.ts). */
export type FinalReviewLens = 'instructor' | 'ta' | 'po' | 'member' | 'no_team' | 'preview';
export type SlotPhase = 'upcoming' | 'live' | 'past';
export type TeamReviewState = 'no_team' | 'no_po' | 'closed' | 'no_slots' | 'full' | 'book' | 'wait_po' | 'booked' | 'booked_closed' | 'joinable' | 'live' | 'past';
export type FinalReviewReason = 'signups_closed' | 'home_ta' | 'time_passed' | 'started' | 'complete';
export type SlotActionId = 'book' | 'move_here' | 'release_own' | 'sign_up' | 'step_down' | 'open_review' | 'join' | 'place_team' | 'delete' | 'review_ta' | 'move_team' | 'release_team';
export interface ApiPerson { user_id: string; name: string | null; email?: string | null; claimed_at?: string | null }
export interface ApiReviewSlot { id: string; starts_at: string; duration_minutes: number; team: { project_id: string; name: string } | null; /** design-side: a pre-slots review time */ history?: boolean }
export interface ApiMyTeam {
  project_id: string; name: string; is_product_owner: boolean; slot_id: string | null; starts_at: string | null; zoom_url: string | null;
  home_ta: ApiPerson | null; review_ta: ApiPerson | null;
  /** Added by the C2 implementation: one Product Owner, or null when the team has none. */
  product_owner: ApiPerson | null;
}
export interface ApiReviewSlots {
  class_id: string; signups_open: boolean; slots: ApiReviewSlot[]; my_team: ApiMyTeam | null;
  unbooked_teams: { project_id: string; name: string; product_owner: ApiPerson | null }[]; review_zoom_url: string | null;
}
export interface ApiFinalReviewSchedule {
  class_id: string; review_zoom_url: string | null; review_period_open: boolean; my_review_count: number;
  teams: { project_id: string; name: string | null; final_review_at: string | null; home_ta: ApiPerson | null; review_ta: ApiPerson | null }[];
}
export interface TeamRecord { project_id: string; name?: string | null; home_ta?: ApiPerson | null; review_ta?: ApiPerson | null; product_owner?: ApiPerson | null; final_review_at?: string | null; slot_id?: string; starts_at?: string; unbooked?: boolean }
export interface BoardContext {
  lens: FinalReviewLens; now?: Date; signupsOpen?: boolean; complete?: boolean; myTeam?: ApiMyTeam | null; viewerId?: string | null;
  teamsById?: Record<string, TeamRecord>; zoomUrl?: string | null;
}
export interface SlotAction { id: SlotActionId; label: string; variant?: 'primary' | 'secondary' | 'ghost' | 'danger-ghost' | 'icon'; href?: string; destructive?: boolean }
export interface SlotView {
  slot: ApiReviewSlot; minutes: number; phase: SlotPhase; started: boolean; team: ApiReviewSlot['team']; mine: boolean; staff: boolean;
  homeTa: ApiPerson | null; reviewTa: ApiPerson | null; room: string | null; joinable: boolean; viewerIsHome: boolean; viewerIsReview: boolean;
  showPeople: boolean; needsReviewTa: boolean;
  /** Badge status keys: 'slot.free' | 'slot.past' | 'slot.yours' | 'live' */
  badges: string[]; actions: SlotAction[]; menu: SlotAction[]; note: FinalReviewReason | null;
}
export interface SlotWhen {
  key: string; iso: string; isoEnd: string; day: string; dayLong: string; start: string; startShort: string; end: string; range: string;
  duration: string; isoDuration: string; differs: boolean; campus: string | null; campusDay: string | null;
}
export interface DayGroup { key: string; isToday: boolean; isPast: boolean; free: number; booked: number; slots: ApiReviewSlot[] }
export interface PostingItem { date: string; time: string; key: string; at: number; startsAt: string; payload: string; posted: boolean; past: boolean; overlaps: string[]; campusLabel: string; viewerLabel: string | null }
export interface PostingDraft { items: PostingItem[]; days: { date: string; label: string; items: PostingItem[] }[]; count: number; fresh: number; posted: number; overlaps: number; past: number; overLimit: number; payload: { starts_at: string[] } }

export const SLOT_MINUTES: number;
export const SLOT_POST_MAX: number;
export const FR_LENSES: FinalReviewLens[];
export const FR_REASONS: Record<FinalReviewReason, string>;
export function slotEnd(startsAt: string | Date, minutes?: number): Date;
export function slotPhase(startsAt: string | Date, now?: Date, minutes?: number): SlotPhase;
export function isReviewJoinable(startsAt: string | Date, now?: Date, zoomUrl?: string | null, minutes?: number): boolean;
export function reviewCountdown(startsAt: string | Date, now?: Date, zone?: string): string | null;
export function fmtSlotWhen(startsAt: string | Date, opts?: { zone?: string; schoolZone?: string; minutes?: number }): SlotWhen;
export function whenText(startsAt: string | Date, opts?: { zone?: string; schoolZone?: string }): string;
export function zoneNote(zone: string, schoolZone?: string, when?: string | Date): string | null;
export function lensOf(x: { classRole?: 'instructor' | 'ta' | 'student'; myTeam?: ApiMyTeam | null; preview?: boolean }): FinalReviewLens;
export function isStaffLens(lens: FinalReviewLens): boolean;
export function indexTeams(reviewSlots: ApiReviewSlots, schedule?: ApiFinalReviewSchedule | null): Record<string, TeamRecord>;
export function groupSlots(slots: ApiReviewSlot[], opts?: { zone?: string; now?: Date }): DayGroup[];
export function slotView(slot: ApiReviewSlot, ctx: BoardContext): SlotView;
export function boardFilters(lens: FinalReviewLens, slots: ApiReviewSlot[], ctx: BoardContext): { value: 'all' | 'free' | 'mine' | 'no_review_ta'; label: string; count: number }[];
export function matchesFilter(view: SlotView, filter?: 'all' | 'free' | 'mine' | 'no_review_ta'): boolean;
export function boardCounts(reviewSlots: ApiReviewSlots, teamsById?: Record<string, TeamRecord>): { slots: number; booked: number; free: number; unbooked: number; noReviewTa: number };
export function countsText(counts: ReturnType<typeof boardCounts>, lens: FinalReviewLens): string[];
export function reviewingText(n: number): string;
export function unbookedTeams(reviewSlots: ApiReviewSlots, teamsById?: Record<string, TeamRecord>): TeamRecord[];
export function historyRows(reviewSlots: ApiReviewSlots, schedule?: ApiFinalReviewSchedule | null): ApiReviewSlot[];
export function freeSlotGroups(slots: ApiReviewSlot[], opts?: { zone?: string; schoolZone?: string; now?: Date; includeStarted?: boolean; exceptId?: string | null }): { label: string; options: { value: string; label: string }[] }[];
export function teamReviewState(x: { myTeam: ApiMyTeam | null; slots?: ApiReviewSlot[]; signupsOpen?: boolean; complete?: boolean; now?: Date }): TeamReviewState;
export function poCanChange(x: { myTeam: ApiMyTeam | null; signupsOpen?: boolean; complete?: boolean; now?: Date }): { ok: boolean; reason: FinalReviewReason | null };
export function teamReviewCopy(state: TeamReviewState, x?: { myTeam?: ApiMyTeam | null; freeCount?: number; variant?: 'page' | 'card'; zone?: string; schoolZone?: string }): { title: string; body: string | null; noReviewTa?: string; noZoom?: string; locked?: string; passed?: string };
export function showTeamReviewCard(x: { myTeam: ApiMyTeam | null; slots?: ApiReviewSlot[]; signupsOpen?: boolean }): boolean;
export function hourlyStarts(first: string, last?: string): string[] | null;
export function offsetIso(date: string, time: string, schoolZone?: string): string;
export function postingDraft(entries: { date: string; time: string }[], opts?: { existing?: ApiReviewSlot[]; now?: Date; zone?: string; schoolZone?: string }): PostingDraft;
export function postedMessage(created: number, sent: number): string;
export function successCopy(action: string, x?: Record<string, any>): string;
/** A TA's sign-up refused because the team moved (409): pass the team and its new time as `when`. */
export function errorCopy(action: string, err?: { status?: number; detail?: string }, x?: { keeps?: string; team?: string; when?: string }): string;
/** ConfirmDialog copy: move_here · release_own · release_team · close_signups · step_down · delete_day. */
export function confirmCopy(kind: 'move_here' | 'release_own' | 'release_team' | 'close_signups' | 'step_down' | 'delete_day', x?: { team?: string; when?: string; from?: string; reviewTa?: string | null; passed?: boolean; count?: number; held?: number; day?: string }): { title: string; message: string; confirmLabel: string; busyLabel?: string; destructive: boolean };
export const FinalReviewsModel: Record<string, any>;

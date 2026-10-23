import { ScheduleModel, SCHOOL_ZONE, JOIN_WINDOW_MS } from '../schedule/ScheduleModel.jsx';
import { TeamMeetingsModel } from '../domain/TeamMeetingsModel.jsx';

const { dayKey, fmtTime, zoneLabel, zoneDiffers, countdown } = ScheduleModel;
const { zonedToInstant } = TeamMeetingsModel;

/**
 * Pure model for the final-review slot sign-up (C2): times in the viewer's zone with the campus
 * time beside them, day groups, which actions each lens has on each slot (and why the others are
 * unavailable), "Your team's review" states and copy, the posting draft, counts, and the copy for
 * every success and error. No UI. Ports to `features/finalReviews/finalReviewsModel.ts`.
 * Inputs are the API's own shapes (brief §8): ApiReviewSlots, ApiFinalReviewSchedule, class TAs.
 */

export const SLOT_MINUTES = 60;
/** The API takes at most 200 start times per post. */
export const SLOT_POST_MAX = 200;
export const FR_LENSES = ['instructor', 'ta', 'po', 'member', 'no_team', 'preview'];

const toDate = (v) => (v instanceof Date ? v : new Date(v));
const ms = (v) => toDate(v).getTime();
const cache = new Map();
const fmt = (zone, opts) => {
  const k = zone + JSON.stringify(opts);
  if (!cache.has(k)) cache.set(k, new Intl.DateTimeFormat('en-US', { timeZone: zone, ...opts }));
  return cache.get(k);
};
/** "9:00 AM" with a plain space (ICU prints U+202F before the period). */
const clock = (when, zone) => fmtTime(when, zone).replace(/\s/g, ' ');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const possessive = (name) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

/* ── Time ─────────────────────────────────────────────────────────────────────────────── */
export function slotEnd(startsAt, minutes = SLOT_MINUTES) { return new Date(ms(startsAt) + minutes * 60000); }
/** upcoming → live (from the start, for its 60 minutes) → past. */
export function slotPhase(startsAt, now = new Date(), minutes = SLOT_MINUTES) {
  const n = ms(now), s = ms(startsAt);
  return n >= s + minutes * 60000 ? 'past' : n >= s ? 'live' : 'upcoming';
}
/** The schedule layer's Join window: 10 minutes before the start until the end, with a room set. */
export function isReviewJoinable(startsAt, now = new Date(), zoomUrl, minutes = SLOT_MINUTES) {
  if (!zoomUrl || !startsAt) return false;
  const n = ms(now), s = ms(startsAt);
  return n >= s - JOIN_WINDOW_MS && n < s + minutes * 60000;
}
/** "today" · "tomorrow" · "in 3 days" within a week; null otherwise (ScheduleModel.countdown). */
export function reviewCountdown(startsAt, now = new Date(), zone = SCHOOL_ZONE) { return countdown({ startsAt: toDate(startsAt).toISOString() }, now, zone); }

/**
 * Everything a slot's time needs, in the viewer's zone, with the campus time when the zones differ
 * (by UTC offset at that instant): campus "9:00 AM PT", or "Mon 3:00 PM PT" when the campus day differs.
 */
export function fmtSlotWhen(startsAt, { zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE, minutes = SLOT_MINUTES } = {}) {
  const s = toDate(startsAt), e = slotEnd(s, minutes);
  const a = clock(s, zone), b = clock(e, zone);
  const [at, ap] = a.split(' '), [, bp] = b.split(' ');
  const key = dayKey(s, zone);
  const differs = zoneDiffers(zone, schoolZone, s);
  const campusSameDay = dayKey(s, schoolZone) === key;
  const campus = differs ? `${campusSameDay ? '' : `${fmt(schoolZone, { weekday: 'short' }).format(s)} `}${clock(s, schoolZone)} ${zoneLabel(schoolZone, s)}` : null;
  return {
    key, iso: s.toISOString(), isoEnd: e.toISOString(),
    day: fmt(zone, { weekday: 'short', month: 'short', day: 'numeric' }).format(s),
    dayLong: fmt(zone, { weekday: 'long', month: 'short', day: 'numeric' }).format(s),
    start: a, startShort: ap === bp ? at : a, end: b, range: ap === bp ? `${at} – ${b}` : `${a} – ${b}`,
    duration: minutes % 60 ? `${minutes} min` : `${minutes / 60} h`, isoDuration: minutes % 60 ? `PT${minutes}M` : `PT${minutes / 60}H`,
    differs, campus, campusDay: differs && !campusSameDay ? fmt(schoolZone, { weekday: 'short', month: 'short', day: 'numeric' }).format(s) : null,
  };
}
/** One-line time for toasts, dialogs and confirmations: "Mon, Dec 7 · 11:00 AM" (+ " (Mon 3:00 PM PT on campus)"). */
export function whenText(startsAt, opts) {
  const w = fmtSlotWhen(startsAt, opts);
  return `${w.day} · ${w.start}${w.campus ? ` (${w.campus} on campus)` : ''}`;
}
/** The page's one mismatch note — "Times in GMT+5:30 · campus is PT" — or null. */
export function zoneNote(zone, schoolZone = SCHOOL_ZONE, when = new Date()) {
  return zoneDiffers(zone, schoolZone, when) ? `Times in ${zoneLabel(zone, when)} · campus is ${zoneLabel(schoolZone, when)}` : null;
}

/* ── Who is looking ───────────────────────────────────────────────────────────────────── */
/** instructor · ta · po · member · no_team · preview (the instructor's "View class as student": read-only, no team). */
export function lensOf({ classRole, myTeam, preview = false } = {}) {
  if (preview) return 'preview';
  if (classRole === 'instructor') return 'instructor';
  if (classRole === 'ta') return 'ta';
  if (!myTeam) return 'no_team';
  return myTeam.is_product_owner ? 'po' : 'member';
}
export const isStaffLens = (lens) => lens === 'instructor' || lens === 'ta';

/** Staff: one record per team from both reads (slots + final-reviews), by project id. */
export function indexTeams(reviewSlots, schedule) {
  const out = {};
  const put = (id, v) => { out[id] = { ...(out[id] || { project_id: id }), ...v }; };
  (schedule?.teams || []).forEach((t) => put(t.project_id, { name: t.name, home_ta: t.home_ta || null, review_ta: t.review_ta || null, final_review_at: t.final_review_at || null }));
  (reviewSlots?.unbooked_teams || []).forEach((t) => put(t.project_id, { name: t.name, product_owner: t.product_owner || null, unbooked: true }));
  (reviewSlots?.slots || []).forEach((s) => { if (s.team) put(s.team.project_id, { name: s.team.name, slot_id: s.id, starts_at: s.starts_at }); });
  return out;
}

/* ── The board ────────────────────────────────────────────────────────────────────────── */
/** Days in the viewer's zone, in time order: { key, isToday, isPast, free, booked, slots }. */
export function groupSlots(slots = [], { zone = SCHOOL_ZONE, now = new Date() } = {}) {
  const today = dayKey(now, zone);
  const map = new Map();
  [...slots].sort((a, b) => ms(a.starts_at) - ms(b.starts_at)).forEach((s) => {
    const key = dayKey(s.starts_at, zone);
    if (!map.has(key)) map.set(key, { key, isToday: key === today, slots: [] });
    map.get(key).slots.push(s);
  });
  return [...map.values()].map((g) => {
    const phases = g.slots.map((s) => slotPhase(s.starts_at, now, s.duration_minutes || SLOT_MINUTES));
    return {
      ...g,
      isPast: phases.every((p) => p === 'past'),
      free: g.slots.filter((s, i) => !s.team && phases[i] === 'upcoming').length,
      booked: g.slots.filter((s) => s.team).length,
    };
  });
}

const ACT = {
  book: { id: 'book', label: 'Book', variant: 'secondary' },
  move_here: { id: 'move_here', label: 'Move here', variant: 'secondary' },
  release_own: { id: 'release_own', label: 'Release', variant: 'danger-ghost' },
  sign_up: { id: 'sign_up', label: 'Sign up to review', variant: 'secondary' },
  step_down: { id: 'step_down', label: 'Step down', variant: 'danger-ghost' },
  open_review: { id: 'open_review', label: 'Open review', variant: 'ghost' },
  join: { id: 'join', label: 'Join Zoom', variant: 'primary' },
  place_team: { id: 'place_team', label: 'Place a team…', variant: 'secondary' },
  delete: { id: 'delete', label: 'Delete slot', variant: 'icon' },
  appoint: { id: 'review_ta', label: 'Appoint Review TA…' },
  change: { id: 'review_ta', label: 'Change Review TA…' },
  move_team: { id: 'move_team', label: 'Move to another slot…' },
  release_team: { id: 'release_team', label: 'Release slot…', destructive: true },
};
/** Why an action isn't offered, as the visible text beside the row (never a title on a disabled button). */
export const FR_REASONS = {
  signups_closed: 'Sign-ups are closed',
  home_ta: 'You’re the Home TA',
  time_passed: 'Your team’s review time has passed',
  started: 'This slot has started',
  complete: 'This class is complete',
};

/**
 * What one slot shows and offers in one lens. `ctx`: { lens, now, signupsOpen, complete, myTeam,
 * viewerId, teamsById, zoomUrl }. Returns badges (status keys), people (staff, or the viewer's own
 * team), the row's actions, the instructor's Menu items, and `note` — a FR_REASONS key shown as text
 * where an action would be.
 */
export function slotView(slot, ctx = {}) {
  const { lens = 'no_team', now = new Date(), signupsOpen = false, complete = false, myTeam = null, viewerId = null, teamsById = {}, zoomUrl = null } = ctx;
  const minutes = slot.duration_minutes || SLOT_MINUTES;
  const phase = slotPhase(slot.starts_at, now, minutes);
  const started = phase !== 'upcoming';
  const team = slot.team || null;
  const mine = !!(team && myTeam && team.project_id === myTeam.project_id);
  const staff = isStaffLens(lens);
  const info = team ? teamsById[team.project_id] || {} : {};
  const homeTa = staff ? info.home_ta || null : mine ? myTeam.home_ta || null : null;
  const reviewTa = staff ? info.review_ta || null : mine ? myTeam.review_ta || null : null;
  const room = staff ? zoomUrl : mine ? myTeam.zoom_url : null;
  const joinable = !!team && isReviewJoinable(slot.starts_at, now, room, minutes);
  const viewerIsHome = !!(homeTa && viewerId && homeTa.user_id === viewerId);
  const viewerIsReview = !!(reviewTa && viewerId && reviewTa.user_id === viewerId);
  const open = signupsOpen && !complete;
  const badges = [];
  if (!team) badges.push(started ? 'slot.past' : 'slot.free');
  if (mine) badges.push('slot.yours');
  if (team && phase === 'live') badges.push('live');
  const actions = [], menu = [];
  let note = null;
  if (slot.history) {
    if (staff) actions.push(ACT.open_review);
  } else if (lens === 'po' && myTeam) {
    const passed = !!(myTeam.starts_at && ms(myTeam.starts_at) <= ms(now));
    if (!team && !started && open && !passed) actions.push(myTeam.slot_id ? ACT.move_here : ACT.book);
    if (mine && open && !passed) actions.push(ACT.release_own);
  } else if (lens === 'ta' && team) {
    // only the Review TA sits in the review from the TA side; the Home TA scores the team but doesn't attend
    if (joinable && viewerIsReview) actions.push({ ...ACT.join, href: room });
    if (viewerIsReview) actions.push(ACT.step_down);
    else if (!reviewTa) {
      if (viewerIsHome) note = 'home_ta';
      else if (!open) note = complete ? 'complete' : 'signups_closed';
      else actions.push(ACT.sign_up);
    }
    actions.push(ACT.open_review);
  } else if (lens === 'instructor') {
    if (!team) {
      if (!complete) actions.push(ACT.place_team, ACT.delete);
    } else {
      if (joinable) actions.push({ ...ACT.join, href: room });
      actions.push(ACT.open_review);
      if (!complete) menu.push(reviewTa ? ACT.change : ACT.appoint, ACT.move_team, ACT.release_team);
    }
  }
  return {
    slot, minutes, phase, started, team, mine, staff, homeTa, reviewTa, room, joinable, viewerIsHome, viewerIsReview,
    showPeople: staff ? !!team : mine, needsReviewTa: staff && !!team && !reviewTa, badges, actions, menu, note,
  };
}

/** Filter chips per lens, with counts. Students: All · Free. TA: All · Teams I review (Review TA teams only) · No Review TA. Instructor: All · Free · No Review TA. */
export function boardFilters(lens, slots = [], ctx = {}) {
  const views = slots.map((s) => slotView(s, { ...ctx, lens }));
  const count = (f) => views.filter((v) => matchesFilter(v, f)).length;
  const all = { value: 'all', label: 'All slots', count: slots.length };
  if (lens === 'ta') return [all, { value: 'mine', label: 'Teams I review', count: count('mine') }, { value: 'no_review_ta', label: 'No Review TA', count: count('no_review_ta') }];
  if (lens === 'instructor') return [all, { value: 'free', label: 'Free', count: count('free') }, { value: 'no_review_ta', label: 'No Review TA', count: count('no_review_ta') }];
  return [all, { value: 'free', label: 'Free', count: count('free') }];
}
export function matchesFilter(view, filter = 'all') {
  if (filter === 'free') return !view.team && !view.started;
  if (filter === 'mine') return view.viewerIsReview;
  if (filter === 'no_review_ta') return view.needsReviewTa && view.phase !== 'past';
  return true;
}

/** Header counts: { slots, booked, free, unbooked, noReviewTa }. */
export function boardCounts(reviewSlots = {}, teamsById = {}) {
  const slots = reviewSlots.slots || [];
  const booked = slots.filter((s) => s.team);
  return {
    slots: slots.length, booked: booked.length, free: slots.length - booked.length,
    unbooked: (reviewSlots.unbooked_teams || []).length,
    noReviewTa: booked.filter((s) => { const t = teamsById[s.team.project_id]; return t && !t.review_ta; }).length,
  };
}
/** ["12 slots", "7 booked", "5 free"] (+ staff: "3 teams without a slot", "3 booked teams without a Review TA"). */
export function countsText(c, lens) {
  const out = [plural(c.slots, 'slot'), `${c.booked} booked`, `${c.free} free`];
  if (isStaffLens(lens)) {
    if (c.unbooked) out.push(`${plural(c.unbooked, 'team')} without a slot`);
    if (c.noReviewTa) out.push(`${plural(c.noReviewTa, 'booked team')} without a Review TA`);
  }
  return out;
}
/** "You're the Review TA for 1 team" (my_review_count: Review TA teams only — the Home TA isn't in the review). */
export const reviewingText = (n) => `You’re the Review TA for ${plural(n, 'team')}`;

/** Staff: teams without a slot, by name, with Product Owner, Home TA and any appointed Review TA. */
export function unbookedTeams(reviewSlots = {}, teamsById = {}) {
  return (reviewSlots.unbooked_teams || [])
    .map((t) => ({ ...teamsById[t.project_id], ...t, product_owner: t.product_owner || null }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
/** A class from before slots: review times from the staff read, as read-only history rows (no slots exist). */
export function historyRows(reviewSlots = {}, schedule = null) {
  if ((reviewSlots.slots || []).length || !schedule) return [];
  return (schedule.teams || []).filter((t) => t.final_review_at)
    .map((t) => ({ id: `history-${t.project_id}`, starts_at: t.final_review_at, duration_minutes: SLOT_MINUTES, team: { project_id: t.project_id, name: t.name }, history: true }))
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
}
/** Free slots for a Select: [{ label: 'Mon, Dec 7', options: [{ value, label: '11:00 AM – 12:00 PM' (+ ' · started') }] }]. */
export function freeSlotGroups(slots = [], { zone, schoolZone, now = new Date(), includeStarted = false, exceptId } = {}) {
  return groupSlots(slots.filter((s) => !s.team && s.id !== exceptId && (includeStarted || slotPhase(s.starts_at, now) === 'upcoming')), { zone, now })
    .map((g) => ({
      label: fmtSlotWhen(g.slots[0].starts_at, { zone, schoolZone }).day,
      options: g.slots.map((s) => {
        const w = fmtSlotWhen(s.starts_at, { zone, schoolZone });
        return { value: s.id, label: `${w.range}${w.campus ? ` (${w.campus})` : ''}${slotPhase(s.starts_at, now) !== 'upcoming' ? ' · started' : ''}` };
      }),
    }));
}

/* ── Your team's review ───────────────────────────────────────────────────────────────── */
/**
 * no_team · no_po · closed · no_slots · full · book (Product Owner) · wait_po (member) ·
 * booked · booked_closed · joinable · live · past.
 * "closed" is one state before sign-ups open and after they close (the app stores one switch).
 */
export function teamReviewState({ myTeam, slots = [], signupsOpen = false, complete = false, now = new Date() } = {}) {
  if (!myTeam) return 'no_team';
  if (myTeam.slot_id && myTeam.starts_at) {
    const phase = slotPhase(myTeam.starts_at, now);
    if (phase === 'past') return 'past';
    if (phase === 'live') return 'live';
    if (isReviewJoinable(myTeam.starts_at, now, myTeam.zoom_url)) return 'joinable';
    return signupsOpen && !complete ? 'booked' : 'booked_closed';
  }
  if (!myTeam.product_owner && !myTeam.is_product_owner) return 'no_po';
  if (!signupsOpen || complete) return 'closed';
  if (!slots.length) return 'no_slots';
  if (!slots.some((s) => !s.team && slotPhase(s.starts_at, now) === 'upcoming')) return 'full';
  return myTeam.is_product_owner ? 'book' : 'wait_po';
}
/** Can the Product Owner change the booking now? { ok, reason } with reason a FR_REASONS key. */
export function poCanChange({ myTeam, signupsOpen, complete = false, now = new Date() } = {}) {
  if (!myTeam || !myTeam.is_product_owner) return { ok: false, reason: null };
  if (complete) return { ok: false, reason: 'complete' };
  if (!signupsOpen) return { ok: false, reason: 'signups_closed' };
  if (myTeam.starts_at && ms(myTeam.starts_at) <= ms(now)) return { ok: false, reason: 'time_passed' };
  return { ok: true, reason: null };
}
/** Title + body for each unbooked state, and the lines the booked states share. */
export function teamReviewCopy(state, { myTeam, freeCount = 0, variant = 'page', zone, schoolZone } = {}) {
  const where = variant === 'card' ? 'on the Final Reviews page' : 'below';
  const C = {
    no_team: { title: 'You’re not on a team', body: `Teams book final reviews, so there’s nothing to book for you. You can still see every slot ${where}.` },
    no_po: { title: 'Your team has no Product Owner', body: 'Only a Product Owner can book your team’s final review. Ask your instructor to make someone Product Owner.' },
    closed: { title: 'No review time yet', body: 'Sign-ups aren’t open, so your team can’t book right now. Your instructor can still give your team a time.' },
    no_slots: { title: 'No slots posted yet', body: 'Sign-ups are open, but your instructor hasn’t posted any times yet.' },
    full: { title: 'Every slot is taken', body: 'There are no free slots left. Ask your instructor for a time.' },
    book: { title: 'Book your team’s final review', body: `Pick one of the ${plural(freeCount, 'free slot')} ${where}. You can change it until sign-ups close.` },
    wait_po: { title: 'Your team hasn’t booked yet', body: myTeam && myTeam.product_owner ? `Your Product Owner, ${myTeam.product_owner.name}, books your team’s slot.` : 'Your Product Owner books your team’s slot.' },
  };
  if (C[state]) return C[state];
  const w = myTeam && myTeam.starts_at ? fmtSlotWhen(myTeam.starts_at, { zone, schoolZone }) : null;
  return {
    title: 'Your team’s final review',
    body: state === 'past' && w ? `Your team was reviewed on ${w.dayLong}.` : null,
    noReviewTa: 'No Review TA has signed up yet.',
    noZoom: 'Your instructor hasn’t set the Zoom room yet.',
    locked: 'Sign-ups are closed, so your slot can’t change. Ask your instructor for any change.',
    passed: 'Your team’s review time has passed, so its slot can’t change.',
  };
}
/** Project page: the card shows for the team's own members once the class has slots or sign-ups are open. */
export function showTeamReviewCard({ myTeam, slots = [], signupsOpen = false } = {}) { return !!myTeam && (slots.length > 0 || signupsOpen || !!myTeam.slot_id); }

/* ── Posting slots (instructor; typed on the campus clock) ─────────────────────────────── */
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
/** Every hour from `first` to `last` ("09:00", "10:00", …); just `first` without a last; null when last < first. */
export function hourlyStarts(first, last) {
  if (!first) return [];
  if (!last) return [first];
  const a = toMin(first), b = toMin(last);
  if (b < a) return null;
  const out = [];
  for (let m = a; m <= b; m += SLOT_MINUTES) out.push(hhmm(m));
  return out;
}
/** The API's form for a start: ISO with the campus offset and no seconds, "2026-12-07T09:00-08:00". */
export function offsetIso(date, time, schoolZone = SCHOOL_ZONE) {
  const inst = zonedToInstant(date, time, schoolZone);
  const p = fmt(schoolZone, { timeZoneName: 'longOffset' }).formatToParts(inst).find((x) => x.type === 'timeZoneName');
  const off = p ? p.value.replace('GMT', '') : '';
  return `${date}T${time}${off || '+00:00'}`;
}
/**
 * The list the form will post, by campus day, each time marked: `posted` (a slot exists — the server
 * skips it), `overlaps` (starts less than 60 minutes from another posted or listed slot — refused: slots
 * never overlap, brief call 15; `overlaps` counts them and the form posts nothing until it is 0), `past`.
 * entries: [{ date: 'YYYY-MM-DD', time: 'HH:MM' }] on the campus clock (duplicates removed).
 */
export function postingDraft(entries = [], { existing = [], now = new Date(), zone = SCHOOL_ZONE, schoolZone = SCHOOL_ZONE } = {}) {
  const seen = new Set();
  const list = entries.filter((e) => { const k = `${e.date}T${e.time}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .map((e) => { const inst = zonedToInstant(e.date, e.time, schoolZone); return { ...e, key: `${e.date}T${e.time}`, at: inst.getTime(), startsAt: inst.toISOString(), payload: offsetIso(e.date, e.time, schoolZone) }; })
    .sort((a, b) => a.at - b.at);
  const have = existing.map((s) => ms(s.starts_at));
  const H = SLOT_MINUTES * 60000;
  const items = list.map((e) => {
    const posted = have.includes(e.at);
    const near = posted ? [] : [...have, ...list.filter((o) => o.key !== e.key).map((o) => o.at)].filter((x) => x !== e.at && Math.abs(x - e.at) < H);
    const differs = zoneDiffers(zone, schoolZone, e.at);
    const viewerDay = differs && dayKey(e.at, zone) !== e.date ? `${fmt(zone, { weekday: 'short' }).format(new Date(e.at))} ` : '';
    return {
      ...e, posted, past: e.at < ms(now),
      overlaps: [...new Set(near)].sort((a, b) => a - b).map((x) => clock(x, schoolZone)),
      campusLabel: clock(e.at, schoolZone),
      viewerLabel: differs ? `${viewerDay}${clock(e.at, zone)} ${zoneLabel(zone, e.at)}` : null,
    };
  });
  const days = [];
  items.forEach((it) => {
    let d = days[days.length - 1];
    if (!d || d.date !== it.date) { d = { date: it.date, label: fmt('UTC', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${it.date}T12:00:00Z`)), items: [] }; days.push(d); }
    d.items.push(it);
  });
  const fresh = items.filter((i) => !i.posted);
  return {
    items, days, count: items.length, fresh: fresh.length, posted: items.length - fresh.length,
    overlaps: fresh.filter((i) => i.overlaps.length).length, past: fresh.filter((i) => i.past).length,
    overLimit: Math.max(0, items.length - SLOT_POST_MAX),
    payload: { starts_at: items.map((i) => i.payload) },
  };
}
/** "Posted 8 slots." · "Posted 6 slots. 2 times already had one." */
export function postedMessage(created, sent) {
  const skipped = Math.max(0, sent - created);
  return `Posted ${plural(created, 'slot')}.${skipped ? ` ${plural(skipped, 'time')} already had one.` : ''}`;
}

/* ── Copy for actions ─────────────────────────────────────────────────────────────────── */
/** Success toasts (polite). x: { when, team, reviewTa, created, sent, open, cleared }. */
export function successCopy(action, x = {}) {
  switch (action) {
    case 'book': return `Booked ${x.when}.`;
    case 'move_here': return `Moved to ${x.when}.${x.reviewTa ? ` ${x.reviewTa} is no longer your Review TA.` : ''}`;
    case 'release_own': return `Released ${x.when}. Your team has no review time now.`;
    case 'place': return `Placed ${x.team} on ${x.when}.`;
    case 'move_team': return `Moved ${x.team} to ${x.when}.${x.reviewTa ? ` ${x.reviewTa} is no longer its Review TA.` : ''}`;
    case 'release_team': return `Released ${possessive(x.team)} slot.${x.reviewTa ? ` ${x.reviewTa} is no longer its Review TA.` : ''}`;
    case 'sign_up': return `You’re ${possessive(x.team)} Review TA · ${x.when}.`;
    case 'step_down': return `You’re no longer ${possessive(x.team)} Review TA.`;
    case 'review_ta': return x.reviewTa ? `${x.reviewTa} is ${possessive(x.team)} Review TA.` : `${x.team} has no Review TA now.`;
    case 'delete': return `Deleted the ${x.when} slot.`;
    case 'delete_day': return `Deleted ${plural(x.count, 'free slot')} on ${x.when}.`;
    case 'post': return postedMessage(x.created, x.sent);
    case 'signups': return x.open ? 'Sign-ups are open.' : 'Sign-ups are closed.';
    case 'zoom': return x.cleared ? 'Zoom room cleared.' : 'Zoom room saved.';
    default: return 'Done.';
  }
}
/**
 * The board's sentence for a refused request (ApiError: { status, detail }). The backend's details
 * are written for people; these stay close to them and say what the board did about it.
 * x: { keeps (the team's current time, if any), team, when (a moved team's new time, for a refused sign-up) }.
 */
export function errorCopy(action, err = {}, x = {}) {
  const status = err.status, d = String(err.detail || '').toLowerCase();
  if (['book', 'move_here', 'place', 'move_team'].includes(action)) {
    if (status === 409 && d.includes('taken')) return x.keeps ? `That slot was just taken, so your team keeps ${x.keeps}. The board is up to date.` : 'That slot was just taken. The board is up to date — pick another free slot.';
    if (status === 409 && d.includes('started')) return 'That slot has already started. The board is up to date — pick a later one.';
    if (status === 403 && d.includes('sign-ups')) return 'Sign-ups closed a moment ago, so your team’s slot can’t change now. Ask your instructor for any change.';
    if (status === 403 && d.includes('passed')) return 'Your team’s review time has passed, so its slot can’t change now. Ask your instructor for any change.';
    if (status === 403) return 'Only the team’s Product Owner can book a slot.';
    if (status === 404 && d.includes('project')) return 'That team no longer exists. The board is up to date.';
    if (status === 404) return 'That slot was deleted. The board is up to date.';
  }
  if (action === 'release_own' || action === 'release_team') {
    if (status === 403 && d.includes('sign-ups')) return 'Sign-ups closed a moment ago, so your team keeps its slot. Ask your instructor for any change.';
    if (status === 403 && d.includes('passed')) return 'Your team’s review time has passed, so its slot can’t be released now.';
    if (status === 403) return 'Only the team’s Product Owner can release a slot.';
    if (status === 404) return 'That team no longer exists. The board is up to date.';
  }
  if (action === 'sign_up' || action === 'review_ta') {
    // the sign-up carries the slot the TA saw; the server refuses it when the team has moved since
    if (status === 409 && (d.includes('moved') || d.includes('changed'))) return `Your sign-up for ${x.team || 'this team'} didn’t go through: the team moved to ${x.when || 'another time'} after you loaded the board. Sign up again at the new time?`;
    if (status === 409) return `Another TA just signed up to review ${x.team || 'this team'}. The board is up to date.`;
    if (status === 403 && d.includes('window')) return 'Sign-ups closed a moment ago, so you can’t sign up now.';
    if (status === 403 && d.includes('slot')) return `${x.team || 'This team'} no longer holds a slot, so there’s nothing to review yet.`;
    if (status === 400 && d.includes('different')) return `You’re ${possessive(x.team || 'this team')} Home TA, so you can’t also be its Review TA.`;
    if (status === 400) return action === 'review_ta' ? 'That TA is no longer a TA in this class. The list is up to date.' : 'You’re no longer a TA in this class.';
  }
  if (action === 'delete' && status === 409) return 'A team booked this slot a moment ago. Release the team first.';
  if (action === 'delete' && status === 404) return 'That slot was already deleted.';
  if (action === 'post' && d.includes('overlap')) return 'A time in the list overlaps a slot that was posted a moment ago. The list is up to date — change or remove it.';
  if (action === 'post' && status === 422) return 'Couldn’t post these times. Check the list and try again.';
  return 'That didn’t work. Try again.';
}

/**
 * The confirmations (ConfirmDialog): move_here (Product Owner), release_own, release_team (instructor),
 * close_signups, step_down, delete_day. x: { team, when, from, reviewTa, passed, count, held, day }.
 */
export function confirmCopy(kind, x = {}) {
  const join = (...parts) => parts.filter(Boolean).join(' ');
  switch (kind) {
    case 'move_here': return { title: `Move your team to ${x.when}?`, message: join(`${x.team} gives up ${x.from}.`, x.reviewTa && `${x.reviewTa} will no longer be your Review TA.`), confirmLabel: 'Move', busyLabel: 'Moving…', destructive: !!x.reviewTa };
    case 'release_own': return { title: 'Release your team’s slot?', message: join(`${x.team} gives up ${x.when} and has no review time until you book again.`, x.reviewTa && `${x.reviewTa} will no longer be your Review TA.`), confirmLabel: 'Release slot', busyLabel: 'Releasing…', destructive: true };
    case 'release_team': return { title: `Release ${possessive(x.team)} slot?`, message: join(`${x.team} loses ${x.when} and has no review time until it books again or you place it.`, x.reviewTa && `${x.reviewTa} will no longer be its Review TA.`, x.passed && 'Its review time has passed, so the review may already have been held and scored. Releasing clears the team’s time and its Review TA; the scores already entered stay.'), confirmLabel: 'Release slot', busyLabel: 'Releasing…', destructive: true };
    case 'close_signups': return { title: 'Close sign-ups?', message: 'Product Owners can no longer book, move or release, and TAs can no longer sign up to review. Review TAs can still step down, and you can still change anything. Nobody is notified.', confirmLabel: 'Close sign-ups', busyLabel: 'Closing…', destructive: false };
    case 'step_down': return { title: `Step down as ${possessive(x.team)} Review TA?`, message: join(`${x.team} will have no Review TA until another TA signs up or the instructor appoints one.`, x.when && `Its review is ${x.when}.`), confirmLabel: 'Step down', busyLabel: 'Stepping down…', destructive: true };
    case 'delete_day': return { title: `Delete ${plural(x.count, 'free slot')} on ${x.day}?`, message: `No team is affected${x.held ? `, and the ${plural(x.held, 'booked slot')} stay${x.held === 1 ? 's' : ''}` : ''}.`, confirmLabel: `Delete ${plural(x.count, 'slot')}`, busyLabel: 'Deleting…', destructive: true };
    default: return { title: 'Are you sure?', message: '', confirmLabel: 'Confirm', destructive: false };
  }
}

export const FinalReviewsModel = {
  confirmCopy,
  SLOT_MINUTES, SLOT_POST_MAX, FR_LENSES, FR_REASONS,
  slotEnd, slotPhase, isReviewJoinable, reviewCountdown, fmtSlotWhen, whenText, zoneNote,
  lensOf, isStaffLens, indexTeams, groupSlots, slotView, boardFilters, matchesFilter, boardCounts, countsText, reviewingText,
  unbookedTeams, historyRows, freeSlotGroups,
  teamReviewState, poCanChange, teamReviewCopy, showTeamReviewCard,
  hourlyStarts, offsetIso, postingDraft, postedMessage, successCopy, errorCopy,
};

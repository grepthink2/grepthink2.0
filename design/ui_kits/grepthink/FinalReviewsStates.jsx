/* GrepThink final reviews — the brief's §6 states, every one in one scrolling sheet (kit-only).
   Rendered by FinalReviewsScreen's "states" view; the viewport switch puts it in a 375px phone frame. */
(function () {
  const NS = window.GrepThinkDesignSystem_36e7e3;
  const { SlotBoard, SlotRow, FinalReviewsHeader, TeamReview, UnbookedTeams, SlotActionDialog, PostSlotsDrawer, ReviewWorkspaceHeader, FinalReviewsModel: M,
    ConfirmDialog, Toast, Alert, Button } = NS;
  const S = window.GT_FINAL_REVIEWS_SAMPLE, F = window.GT_FR;
  const WEEK = new Date(F.CLOCKS.booking_week), DAY = new Date(F.CLOCKS.review_day), AFTER = new Date(F.CLOCKS.after);
  const extraViewers = {
    trail_member: { key: 'trail_member', label: 'Trailhead member', role: 'student', user: { user_id: 'u-mina-patel', name: 'Mina Patel' }, teamId: 'p-trailhead' },
    luis: { key: 'luis', label: 'TA (Luis Ortega)', role: 'ta', user: { user_id: 'u-luis-ortega', name: 'Luis Ortega' } },
    priya: { key: 'priya', label: 'TA (Priya Nair)', role: 'ta', user: { user_id: 'u-priya-nair', name: 'Priya Nair' } },
  };
  Object.assign(F.VIEWERS, extraViewers);
  Object.keys(extraViewers).forEach((k) => { Object.defineProperty(F.VIEWERS, k, { enumerable: false }); });
  const base = F.worldFrom(S);
  const closed = { ...base, signupsOpen: false };
  const full = { ...base, slots: base.slots.filter((s) => s.teamId) };
  const empty = F.worldFrom(F.emptySource());
  const emptyOpen = { ...empty, signupsOpen: true };
  const many = F.worldFrom(S.many);
  const hist = F.worldFrom(S.history, { complete: true });
  const noop = () => {};
  const wait = () => new Promise((r) => setTimeout(r, 500));

  function Frame({ cap, wide, children }) {
    return <div className={wide ? 'fr-states__wide' : ''}><p className="fr-caption">{cap}</p>{children}</div>;
  }
  function useBoard(zone) {
    return ({ w = base, who, now = WEEK, ...rest }) => {
      const p = F.payloadFor(w, who);
      return <SlotBoard data={p.reviewSlots} schedule={p.schedule} lens={p.lens} viewerId={p.viewerId} now={now} zone={zone} complete={w.complete}
        reviewHref={(t) => `#review/${t.project_id}`} onAction={(a, s, v, e) => e && e.preventDefault && e.preventDefault()} onDayAction={noop} onPostSlots={noop} onRetry={noop} {...rest} />;
    };
  }
  function Team({ w = base, who, now = WEEK, zone, ...rest }) {
    const p = F.payloadFor(w, who);
    return <TeamReview myTeam={p.myTeam} slots={p.reviewSlots.slots} signupsOpen={p.reviewSlots.signups_open} now={now} zone={zone} onChooseSlot={noop} onChangeSlot={noop} onRelease={noop} {...rest} />;
  }
  function Head({ w = base, who, ...rest }) {
    const p = F.payloadFor(w, who);
    return <FinalReviewsHeader lens={p.lens} signupsOpen={p.reviewSlots.signups_open} counts={M.boardCounts(p.reviewSlots, M.indexTeams(p.reviewSlots, p.schedule))}
      myReviewCount={p.schedule ? p.schedule.my_review_count : 0} zoomUrl={p.reviewSlots.review_zoom_url} onPostSlots={noop} onToggleSignups={noop} onSaveZoom={noop} {...rest} />;
  }
  /* One slot seen through one lens — the same Trailhead row in every lens. */
  function Row({ who, slotId = 's-1207-0900', w = base, now = WEEK, zone }) {
    const p = F.payloadFor(w, who);
    const slot = p.reviewSlots.slots.find((s) => s.id === slotId);
    const ctx = { lens: p.lens, now, signupsOpen: p.reviewSlots.signups_open, myTeam: p.myTeam, viewerId: p.viewerId,
      teamsById: p.lens === 'instructor' || p.lens === 'ta' ? M.indexTeams(p.reviewSlots, p.schedule) : {}, zoomUrl: p.lens === 'instructor' || p.lens === 'ta' ? p.reviewSlots.review_zoom_url : null };
    return <div className="gt-fr-board"><div className="gt-fr-board__surface"><ul className="gt-fr-board__list"><SlotRow slot={slot} context={ctx} zone={zone} reviewHref={(t) => `#review/${t.project_id}`} onAction={(a, s, v, e) => e && e.preventDefault && e.preventDefault()} /></ul></div></div>;
  }
  const Confirm = (k, x) => { const c = M.confirmCopy(k, x); return <div className="fr-dialog-stage"><ConfirmDialog open portal={false} title={c.title} message={c.message} confirmLabel={c.confirmLabel} destructive={c.destructive} onCancel={noop} onConfirm={noop} /></div>; };

  function FinalReviewsStates({ zone = F.PT }) {
    const Board = useBoard(zone);
    const W = (iso) => M.whenText(iso, { zone });
    const staff = F.payloadFor(base, 'instructor');
    const byId = M.indexTeams(staff.reviewSlots, staff.schedule);
    const slots = staff.reviewSlots.slots;
    const team = (id) => ({ ...byId[id], project_id: id });
    const manyStaff = F.payloadFor(many, 'instructor');
    const e409 = (a, d, x) => M.errorCopy(a, { status: 409, detail: d }, x);
    const e403 = (a, d, x) => M.errorCopy(a, { status: 403, detail: d }, x);
    return (
      <div className="fr-states">
        <p className="fr-states__lbl">Load, refetch, error</p>
        <Frame cap="First load — header, Your team's review and the board as skeletons (every lens)" wide>
          <div className="fr-page"><Head who="po" status="loading" /><Team who="po" status="loading" /><Board who="po" status="loading" /></div>
        </Frame>
        <Frame cap="Refetching after an action — the board holds its frame (aria-busy)"><Board who="po_booked" status="refetching" /></Frame>
        <Frame cap="Page error — quiet text + Try again, never a red panel"><Board who="instructor" status="error" /></Frame>

        <p className="fr-states__lbl">No slots · sign-ups open / closed</p>
        <Frame cap="No slots posted — instructor: the empty state leads to Post slots"><Board who="instructor" w={empty} /></Frame>
        <Frame cap="No slots posted — everyone else"><Board who="member_wait" w={empty} /></Frame>
        <Frame cap="Sign-ups open, no slots posted — the instructor is told nobody can book yet"><Head who="instructor" w={emptyOpen} /></Frame>
        <Frame cap="Sign-ups closed with slots posted (the same state before opening and after closing)"><div className="fr-page"><Head who="member_wait" w={closed} /><Team who="member_wait" w={closed} /></div></Frame>

        <p className="fr-states__lbl">One booked team (Trailhead, Mon 9:00 AM) through every lens</p>
        <Frame cap="Its Product Owner — Release"><Row who="po_booked" zone={zone} /></Frame>
        <Frame cap="Its member — the Review TA they present to, no actions"><Row who="trail_member" zone={zone} /></Frame>
        <Frame cap="Another student — the team, never its reviewers"><Row who="po" zone={zone} /></Frame>
        <Frame cap="TA who is its Home TA (Maya Chen) — scores the team, isn't in the review: no Join, can't be its Review TA"><Row who="ta" zone={zone} /></Frame>
        <Frame cap="TA who is its Review TA (Luis Ortega) — Step down"><Row who="luis" zone={zone} /></Frame>
        <Frame cap="TA who is neither (Priya Nair) — Open review, read-only"><Row who="priya" zone={zone} /></Frame>
        <Frame cap="A booked team without a Review TA, a TA who may sign up (Priya, Redwood Labs)"><Row who="priya" slotId="s-1207-1300" zone={zone} /></Frame>
        <Frame cap="The instructor — Open review + the row Menu"><Row who="instructor" zone={zone} /></Frame>

        <p className="fr-states__lbl">Refusals — the board refreshes and says so above it</p>
        <Frame cap="A slot taken by a race (409) — the team keeps the slot it had" wide><Board who="po_booked" alert={e409('move_here', 'That slot was just taken.', { keeps: W('2026-12-07T17:00:00Z') })} onDismissAlert={noop} /></Frame>
        <Frame cap="A slot that started in the meantime (409)"><Alert tone="warning" onDismiss={noop}>{e409('book', 'That slot has already started.')}</Alert></Frame>
        <Frame cap="Sign-ups closed in the meantime (403)"><Alert tone="warning" onDismiss={noop}>{e403('book', "Sign-ups aren't open.")}</Alert></Frame>
        <Frame cap="The team's review time passed (403)"><Alert tone="warning" onDismiss={noop}>{e403('release_own', "Your team's review time has passed.")}</Alert></Frame>
        <Frame cap="Another TA signed up a moment earlier (409)"><Alert tone="warning" onDismiss={noop}>{e409('sign_up', 'This team already has an additional reviewer', { team: 'Redwood Labs' })}</Alert></Frame>
        <Frame cap="A TA signs up for a team that moved after the board loaded — refused (409, the request carried the slot the TA saw); the board refreshes and offers the new time"><Alert tone="warning" onDismiss={noop} actions={<Button size="sm" variant="outline">Sign up for {W('2026-12-08T18:00:00Z')}</Button>}>{M.errorCopy('sign_up', { status: 409, detail: 'This team moved to another slot.' }, { team: 'Redwood Labs', when: W('2026-12-08T18:00:00Z') })}</Alert></Frame>
        <Frame cap="Instructor deletes a slot a team just booked (409)"><Alert tone="warning" onDismiss={noop}>{M.errorCopy('delete', { status: 409, detail: 'Release the team before deleting its slot.' })}</Alert></Frame>

        <p className="fr-states__lbl">Moves and releases</p>
        <Frame cap="Product Owner moves, dropping the Review TA">{Confirm('move_here', { team: 'Trailhead', when: W('2026-12-08T18:00:00Z'), from: W('2026-12-07T17:00:00Z'), reviewTa: 'Luis Ortega' })}</Frame>
        <Frame cap="Product Owner moves, no Review TA to drop">{Confirm('move_here', { team: 'Redwood Labs', when: W('2026-12-08T18:00:00Z'), from: W('2026-12-07T21:00:00Z') })}</Frame>
        <Frame cap="Release, with a Review TA">{Confirm('release_own', { team: 'Trailhead', when: W('2026-12-07T17:00:00Z'), reviewTa: 'Luis Ortega' })}</Frame>
        <Frame cap="Release, without one (instructor)">{Confirm('release_team', { team: 'Redwood Labs', when: W('2026-12-07T21:00:00Z') })}</Frame>
        <Frame cap="Instructor moves a team — Luis Ortega named; Appoint again follows in the toast"><div className="fr-dialog-stage fr-dialog-stage--tall"><SlotActionDialog open portal={false} kind="move_team" team={team('p-trailhead')} slots={slots} now={WEEK} zone={zone} defaultValue="s-1208-1000" onConfirm={wait} onCancel={noop} /></div></Frame>
        <Frame cap="…and the toast after the move"><Toast variant="success" message={M.successCopy('move_team', { team: 'Trailhead', when: W('2026-12-08T18:00:00Z'), reviewTa: 'Luis Ortega' })} actionLabel="Appoint again" onAction={noop} /></Frame>

        <p className="fr-states__lbl">Review day and after</p>
        <Frame cap="Live review (Join window) — the team's own card" wide><Team who="po_booked" w={closed} now={DAY} zone={zone} /></Frame>
        <Frame cap="Review day board — Trailhead live, the instructor's Join Zoom inside the window" wide><Board who="instructor" w={closed} now={new Date('2026-12-07T17:55:00Z')} /></Frame>
        <Frame cap="A past review"><Team who="po_booked" w={closed} now={AFTER} zone={zone} /></Frame>
        <Frame cap="Past days on the board — Monday folded on Tuesday"><Board who="ta" w={closed} now={new Date('2026-12-08T18:30:00Z')} /></Frame>
        <Frame cap="The instructor on a started slot — Place a team… records a review held outside the app"><div className="fr-dialog-stage fr-dialog-stage--tall"><SlotActionDialog open portal={false} kind="place_team" slot={slots.find((s) => s.id === 's-1207-1100')} slots={slots} unbooked={M.unbookedTeams(staff.reviewSlots, byId)} teamsById={byId} now={new Date('2026-12-07T19:30:00Z')} zone={zone} defaultValue="p-arboretum" onConfirm={wait} onCancel={noop} /></div></Frame>
        <Frame cap="…and releasing a team whose time has passed (scores stay)">{Confirm('release_team', { team: 'Trailhead', when: W('2026-12-07T17:00:00Z'), reviewTa: 'Luis Ortega', passed: true })}</Frame>

        <p className="fr-states__lbl">Gaps</p>
        <Frame cap="Every slot taken while teams still have none"><Team who="po" w={full} zone={zone} /></Frame>
        <Frame cap="A team without a Product Owner — the member's card"><Team who="no_po" zone={zone} /></Frame>
        <Frame cap="…and the staff list (amber No Product Owner)"><UnbookedTeams teams={M.unbookedTeams(staff.reviewSlots, byId)} lens="instructor" onAction={noop} /></Frame>
        <Frame cap="A student on no team — the board stays readable"><div className="fr-page"><Team who="no_team" zone={zone} /><Board who="no_team" /></div></Frame>
        <Frame cap="The instructor's student preview — the no-team state, read-only"><div className="fr-page"><Team who="preview" zone={zone} /></div></Frame>

        <p className="fr-states__lbl">History, posting, zones, density</p>
        <Frame cap="A finished class from before slots — staff see the recorded times read-only"><Board who="instructor" w={hist} now={new Date(S.history.now)} /></Frame>
        <Frame cap="…students see the no-slots state"><Board who="member" w={hist} now={new Date(S.history.now)} /></Frame>
        <Frame cap="Posting — an overlapping time (refused: Change or ×, nothing posts until fixed), a past time (allowed, with its note), times already posted"><div className="fr-dialog-stage fr-dialog-stage--drawer"><PostSlotsDrawer open portal={false} width="100%" existing={slots} now={WEEK} zone={zone}
          defaultEntries={[{ date: '2026-11-30', time: '08:00' }, { date: '2026-12-07', time: '09:00' }, { date: '2026-12-07', time: '09:30' }, { date: '2026-12-07', time: '16:00' }, { date: '2026-12-09', time: '09:00' }, { date: '2026-12-09', time: '10:00' }]} onPost={wait} onClose={noop} /></div></Frame>
        <Frame cap="A viewer in India — campus times beside the viewer's, days regrouped (3:00 PM PT Monday → Tuesday 4:30 AM)"><div className="fr-page"><Team who="member" zone={F.IST} /><Board who="po" /></div></Frame>
        <Frame cap="40 slots, long team names, many teams without a slot (instructor)" wide>
          <div className="fr-page"><Head who="instructor" w={many} /><div className="fr-scrollbox"><Board who="instructor" w={many} /></div><UnbookedTeams teams={M.unbookedTeams(manyStaff.reviewSlots, M.indexTeams(manyStaff.reviewSlots, manyStaff.schedule))} lens="instructor" onAction={noop} /></div>
        </Frame>
        <Frame cap="The scoring workspace header — instructor, before the review" wide><ReviewWorkspaceHeader team={team('p-trailhead')} viewerRole="instructor" startsAt="2026-12-07T17:00:00+00:00" homeTa={byId['p-trailhead'].home_ta} reviewTa={byId['p-trailhead'].review_ta} zoomUrl={S.review_slots_staff.review_zoom_url} now={WEEK} zone={zone} /></Frame>
        <Frame cap="…the Home TA inside the Join window — the Home TA view stays, with no Join Zoom (the Home TA scores but doesn't attend)" wide><ReviewWorkspaceHeader team={team('p-trailhead')} viewerRole="home" startsAt="2026-12-07T17:00:00+00:00" homeTa={byId['p-trailhead'].home_ta} reviewTa={byId['p-trailhead'].review_ta} zoomUrl={S.review_slots_staff.review_zoom_url} now={new Date('2026-12-07T16:55:00Z')} zone={zone} /></Frame>
      </div>
    );
  }
  window.FinalReviewsStates = FinalReviewsStates;
})();

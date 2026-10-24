/* GrepThink final reviews (C2) — UI-kit screen composition.
   Composes components/finalreviews/*; reads window.GT_FINAL_REVIEWS_SAMPLE through window.GT_FR (one mutable
   "world" per class → the API payload each viewer would get). Kit-only: the shell, the demo bar and the in-memory server. */
const NS = window.GrepThinkDesignSystem_36e7e3;
const { SlotBoard, FinalReviewsHeader, TeamReview, UnbookedTeams, SlotActionDialog, PostSlotsDrawer, ReviewWorkspaceHeader, FinalReviewsModel,
  ConfirmDialog, ToastStack, SidebarNavItem, SidebarSectionTitle, Avatar, Button, ProgressBar } = NS;
const M = FinalReviewsModel;
const S = window.GT_FINAL_REVIEWS_SAMPLE, F = window.GT_FR;
const ZONES = { pt: { label: 'PT', zone: F.PT }, ist: { label: 'India', zone: F.IST } };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (w) => ({ ...w, slots: w.slots.map((s) => ({ ...s })), teams: Object.fromEntries(Object.entries(w.teams).map(([k, v]) => [k, { ...v }])) });

const svg = (d, size = 18) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: d }} />;
const I = {
  home: svg('<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  msg: svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  chart: svg('<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>'),
  book: svg('<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>'),
  plus: svg('<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>'),
  login: svg('<path d="m10 17 5-5-5-5"/><path d="M15 12H3"/><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>'),
  dash: svg('<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>'),
  kanban: svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>'),
  folder: svg('<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
  compass: svg('<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>'),
  folderPlus: svg('<path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'),
  users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  blocks: svg('<rect width="7" height="7" x="14" y="3" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>'),
  clip: svg('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>'),
  clipList: svg('<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>'),
  userCog: svg('<circle cx="18" cy="15" r="3"/><circle cx="9" cy="7" r="4"/><path d="M10 15H6a4 4 0 0 0-4 4v2"/><path d="m21.7 16.4-.9-.3"/><path d="m15.2 13.9-.9-.3"/><path d="m16.6 18.7.3-.9"/><path d="m19.1 12.2.3-.9"/><path d="m19.6 18.7-.4-1"/><path d="m16.8 12.3-.4-1"/><path d="m14.3 16.6 1-.4"/><path d="m20.7 13.8 1-.4"/>'),
  calCheck: svg('<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>'),
  listChecks: svg('<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>'),
  gear: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  bell: svg('<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>', 20),
  search: svg('<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>', 22),
  chev: svg('<path d="m6 9 6 6 6-6"/>', 14),
  eye: svg('<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>', 16),
  folderKanban: svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 10v4"/><path d="M12 10v2"/><path d="M16 10v6"/>', 28),
};

/* The codebase's sidebar (features/app/config/sidebar.ts) with this round's items: students get Final Reviews in
   Coursework after Assignments; TAs see it once, under TA Review; the instructor keeps it in Coursework. */
function navFor(lens) {
  const FR = ['Final Reviews', I.clip, 'board'];
  const student = [['Team', [['My Project', I.folder, 'project'], ['Browse Projects', I.compass], ['Create Project', I.folderPlus]]], ['Coursework', [['Assignments', I.clipList], FR]], ['Class', [['Roster', I.users], ['TA Meetings', I.calCheck]]]];
  if (lens === 'instructor') return [['Main', [['Home', I.home], ['Messages', I.msg], ['Analytics', I.chart]]], ['Classes', [['My Classes', I.book], ['Create Class', I.plus]]], [null, [['Dashboard', I.dash]]], ['Teams', [['Projects', I.kanban], ['Roster', I.users]]], ['Coursework', [['Modules', I.blocks], FR]], ['TAs', [['TA Management', I.userCog], ['TA Meetings', I.calCheck]]]];
  const main = [['Main', [['Home', I.home], ['Messages', I.msg]]], ['Classes', [['My Classes', I.book], ['Join Class', I.login]]]];
  if (lens === 'ta') return [...main, ['Team', student[0][1]], ['Coursework', [['Assignments', I.clipList]]], student[2], ['TA Review', [['TSRs', I.listChecks], FR]]];
  return [...main, ...student];
}

function Shell({ phone, lens, viewer, title, active, preview, contentRef, onNav, classLabel, children }) {
  return (
    <div className="fr-app">
      {!phone && (
        <aside className="fr-side" aria-label="Main navigation">
          <img className="fr-side__logo" src="../../assets/grepthink-logo.svg" alt="GrepThink" />
          <button type="button" className="fr-class">{I.book}<span>{classLabel}</span><span>{I.chev}</span></button>
          <div className="fr-side__nav">
            {navFor(lens === 'instructor' || lens === 'ta' ? lens : 'student').map(([title, items], gi) => (
              <div key={gi} className="fr-side__group">
                {title && <SidebarSectionTitle>{title}</SidebarSectionTitle>}
                {items.map(([label, icon, to]) => <SidebarNavItem key={label} icon={icon} label={label} active={!!to && to === active} badge={label === 'Messages' ? 4 : undefined} onClick={to ? () => onNav(to) : undefined} />)}
              </div>
            ))}
          </div>
          <SidebarNavItem icon={I.gear} label="Settings" />
        </aside>
      )}
      <div className="fr-main">
        {preview && <div className="fr-preview" role="status">{I.eye}<span>Viewing {classLabel} as a student · read-only</span><button type="button" className="fr-preview__exit">Exit preview</button></div>}
        <header className="fr-header">
          {phone && <button type="button" className="fr-header__icon fr-header__icon--plain" aria-label="Open menu">{I.menu}</button>}
          <h1 className="fr-header__title">{title}</h1>
          <div className="fr-header__right">
            <button type="button" className="fr-header__icon" aria-label="Search">{I.search}</button>
            {!phone && <button type="button" className="fr-header__icon" aria-label="Notifications">{I.bell}</button>}
            {!phone && <Avatar name={viewer.user.name} size="sm" />}
          </div>
        </header>
        <main className="fr-content" ref={contentRef}>{children}</main>
      </div>
    </div>
  );
}

function ProjectPage({ p, now, zone, onBoard, onRelease, busy }) {
  const my = p.myTeam;
  if (!my) return <p className="fr-note">This viewer is on no team, so there is no project page. The Final review card shows only to a team's own members.</p>;
  const show = M.showTeamReviewCard({ myTeam: my, slots: p.reviewSlots.slots, signupsOpen: p.reviewSlots.signups_open });
  return (
    <div>
      <header className="fr-pv__header">
        <span className="fr-pv__logo">{I.folderKanban}</span>
        <div><h2 className="fr-pv__title">{my.name}</h2><p className="fr-pv__meta">{S.class.label} · 5 members{my.product_owner ? ` · Product Owner ${my.product_owner.name}` : ''}</p></div>
      </header>
      <div className="fr-pv__content">
        <section className="fr-card fr-pv__desc" aria-label="Project description">
          <p>A course-scheduling assistant for UCSC students: import your shopping cart, see conflicts, and share a plan with your advisor.</p>
          <h4>Sprint 4 goals</h4>
          <ul><li>Conflict view on phones</li><li>Advisor share links</li><li>Release documents for the final review</li></ul>
        </section>
        <div className="fr-pv__aside">
          <section className="fr-card" aria-labelledby="fr-sprint-h">
            <div className="fr-card__head"><h2 id="fr-sprint-h" className="fr-card__title">Sprint 4</h2><span className="fr-card__date">Nov 23 – Dec 4</span></div>
            <ProgressBar value={9} max={16} size="sm" />
            <p className="fr-pv__sprint"><span>9 of 16 points done</span><span>4 days left</span></p>
          </section>
          {show ? (
            <section className="fr-card" aria-labelledby="fr-review-card-h">
              <div className="fr-card__head"><h2 id="fr-review-card-h" className="fr-card__title">Final review</h2><a href="#board" onClick={(e) => { e.preventDefault(); onBoard(); }}>See all slots</a></div>
              <TeamReview variant="card" myTeam={my} slots={p.reviewSlots.slots} signupsOpen={p.reviewSlots.signups_open} now={now} zone={zone}
                onChooseSlot={() => onBoard('free')} onChangeSlot={() => onBoard('free')} onRelease={onRelease} busy={busy} />
            </section>
          ) : <p className="fr-note">No Final review card: the class has no slots yet and sign-ups are closed (the card appears once either changes).</p>}
          <section className="fr-card" aria-labelledby="fr-tm-h">
            <div className="fr-card__head"><h2 id="fr-tm-h" className="fr-card__title">Team meetings</h2></div>
            <p className="fr-quiet">No upcoming meetings.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function WorkspacePage({ p, world, teamId, now, zone, onBack, onPick }) {
  if (p.lens !== 'instructor' && p.lens !== 'ta') return <p className="fr-note">The scoring workspace is for staff; /app/final-reviews/:projectId sends students back to the board.</p>;
  const t = world.teams[teamId] || Object.values(world.teams)[0];
  const held = world.slots.find((s) => s.teamId === t.project_id);
  const startsAt = held ? held.starts_at : (!world.slots.length && t.legacy_at) || null;
  const role = p.lens === 'instructor' ? 'instructor' : t.home_ta && t.home_ta.user_id === p.viewerId ? 'home' : t.review_ta && t.review_ta.user_id === p.viewerId ? 'review' : 'ta';
  return (
    <div className="fr-page">
      <ReviewWorkspaceHeader team={t} viewerRole={role} startsAt={startsAt} homeTa={t.home_ta} reviewTa={t.review_ta} zoomUrl={world.zoomUrl} now={now} zone={zone}
        backHref="#board" onBack={(e) => { e.preventDefault(); onBack(); }} onJoin={(e) => e && e.preventDefault && e.preventDefault()} />
      <section className="fr-card fr-ws-body">
        <p className="fr-ws-body__title">Scores and review notes</p>
        <p className="fr-quiet">Not redesigned in this round — the C2 implementation moves this part of FinalReviewDetail onto the kit as it stands.</p>
        <div className="fr-ws-body__pick">
          <span>Open another team:</span>
          {Object.values(world.teams).slice(0, 6).map((x) => <Button key={x.project_id} size="sm" variant={x.project_id === t.project_id ? 'secondary' : 'ghost'} onClick={() => onPick(x.project_id)}>{x.name}</Button>)}
        </div>
      </section>
    </div>
  );
}

function FinalReviewsApp() {
  const [viewerKey, setViewerKey] = React.useState('instructor');
  const [view, setView] = React.useState('board');
  const [clock, setClock] = React.useState('booking_week');
  const [zoneKey, setZoneKey] = React.useState('pt');
  const [dataKey, setDataKey] = React.useState('ready');
  const [apiMode, setApiMode] = React.useState('ok');
  const [viewport, setViewport] = React.useState('desktop');
  const makeWorld = (d, c) => {
    const w = d === 'empty' ? F.worldFrom(F.emptySource()) : d === 'many' ? F.worldFrom(S.many) : d === 'history' ? F.worldFrom(S.history, { complete: true }) : F.worldFrom(S);
    if (d !== 'empty' && d !== 'history') w.signupsOpen = c === 'booking_week';
    return w;
  };
  const [world, setWorldState] = React.useState(() => makeWorld('ready', 'booking_week'));
  const worldRef = React.useRef(world);
  const setWorld = (w) => { worldRef.current = w; setWorldState(w); };
  const mutate = (fn) => { const w = clone(worldRef.current); fn(w); setWorld(w); return w; };
  const [filter, setFilter] = React.useState('all');
  const [alert, setAlert] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [headBusy, setHeadBusy] = React.useState(null);
  const [refetching, setRefetching] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);
  const [confirm, setConfirm] = React.useState(null);
  const [dialog, setDialog] = React.useState(null);
  const [posting, setPosting] = React.useState(false);
  const [wsTeam, setWsTeam] = React.useState('p-trailhead');
  const [last, setLast] = React.useState(null);
  const contentRef = React.useRef(null);

  const zone = ZONES[zoneKey].zone;
  const now = dataKey === 'history' ? new Date(S.history.now) : new Date(F.CLOCKS[clock]);
  const p = F.payloadFor(world, viewerKey);
  const staff = p.lens === 'instructor' || p.lens === 'ta';
  const teamsById = M.indexTeams(p.reviewSlots, p.schedule);
  const status = dataKey === 'loading' ? 'loading' : dataKey === 'error' ? 'error' : refetching ? 'refetching' : 'ready';
  const when = (iso) => M.whenText(iso, { zone });
  const classLabel = dataKey === 'history' ? S.history.class_label : S.class.label;

  const pick = (fn) => (v) => fn(v);
  const changeData = (d) => { setDataKey(d); setWorld(makeWorld(d, clock)); setAlert(null); setFilter('all'); };
  const changeClock = (c) => { setClock(c); mutate((w) => { if (dataKey !== 'empty' && dataKey !== 'history') w.signupsOpen = c === 'booking_week'; }); setAlert(null); };
  const toast = (variant, message, extra = {}) => setToasts((t) => [{ id: `${Date.now()}-${Math.random()}`, variant, message, ...extra }, ...t].slice(0, 3));
  const refetch = () => { setRefetching(true); setTimeout(() => setRefetching(false), 450); };
  const scrollToBoard = () => { const c = contentRef.current, el = c && c.querySelector('.fr-board-anchor'); if (c && el) c.scrollTo({ top: el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 12, behavior: 'smooth' }); };
  const goBoard = (f) => { setView('board'); if (f) setFilter(f); setTimeout(scrollToBoard, 60); };

  /* ── in-memory server ─────────────────────────────────────────────── */
  const race = (action) => {
    const applies = { taken: ['book', 'move_here', 'place', 'move_team', 'delete'], started: ['book', 'move_here', 'place', 'move_team'], closed: ['book', 'move_here', 'release_own', 'sign_up'],
      passed: ['move_here', 'release_own'], ta_taken: ['sign_up'], moved: ['sign_up'], fails: ['*'] }[apiMode] || [];
    if (applies.includes(action) || applies.includes('*')) { setApiMode('ok'); return apiMode; }
    return null;
  };
  const rivalTeam = (w) => {
    const held = new Set(w.slots.map((s) => s.teamId).filter(Boolean));
    const mine = p.myTeam ? p.myTeam.project_id : null;
    const free = Object.values(w.teams).find((t) => !held.has(t.project_id) && t.project_id !== mine);
    if (free) return free.project_id;
    w.teams['p-porter-meadow'] = { project_id: 'p-porter-meadow', name: 'Porter Meadow', home_ta: null, review_ta: null, product_owner: null };
    return 'p-porter-meadow';
  };
  const ERR = { taken: [409, 'That slot was just taken.'], started: [409, 'That slot has already started.'], closed: [403, "Sign-ups aren't open."], passed: [403, "Your team's review time has passed."], ta_taken: [409, 'This team already has an additional reviewer'], delete: [409, 'Release the team before deleting its slot.'] };
  const conflict = (action, r, { slot, teamId, teamName } = {}) => {
    const [status, detail] = action === 'delete' ? ERR.delete : ERR[r];
    mutate((w) => {
      if ((r === 'taken') && slot) { const s = w.slots.find((x) => x.id === slot.id); if (s && !s.teamId) s.teamId = rivalTeam(w); }
      if (r === 'closed') w.signupsOpen = false;
      if (r === 'ta_taken' && teamId) { const t = w.teams[teamId]; const other = w.tas.find((x) => x.id !== p.viewerId && (!t.home_ta || x.id !== t.home_ta.user_id)); t.review_ta = { user_id: other.id, name: other.name }; }
    });
    const keeps = p.myTeam && p.myTeam.starts_at && (action === 'book' || action === 'move_here') ? when(p.myTeam.starts_at) : null;
    setAlert(M.errorCopy(action, { status, detail }, { keeps, team: teamName }));
    setLast(`${status} · ${detail}`);
    refetch();
  };
  const withRow = async (slot, action, fn) => { setBusy({ slotId: slot.id, action }); await delay(500); setBusy(null); return fn(); };

  const actions = {
    book: (slot) => withRow(slot, 'book', () => {
      const r = race('book'); if (r === 'fails') return toast('error', 'That didn’t work. Try again.'); if (r) return conflict('book', r, { slot });
      mutate((w) => { w.slots.find((s) => s.id === slot.id).teamId = p.myTeam.project_id; });
      setAlert(null); toast('success', M.successCopy('book', { when: when(slot.starts_at) })); refetch();
    }),
    move_here: (slot) => {
      const t = p.myTeam, rt = t.review_ta;
      const c = M.confirmCopy('move_here', { team: t.name, when: when(slot.starts_at), from: when(t.starts_at), reviewTa: rt && rt.name });
      setConfirm({ ...c, onConfirm: async () => {
        await delay(500); const r = race('move_here'); if (r === 'fails') throw new Error('fail');
        setConfirm(null); if (r) return conflict('move_here', r, { slot });
        mutate((w) => { w.slots.forEach((s) => { if (s.teamId === t.project_id) s.teamId = null; }); w.slots.find((s) => s.id === slot.id).teamId = t.project_id; w.teams[t.project_id].review_ta = null; });
        setAlert(null); toast('success', M.successCopy('move_here', { when: when(slot.starts_at), reviewTa: rt && rt.name })); refetch();
      } });
    },
    release_own: () => {
      const t = p.myTeam, rt = t.review_ta;
      setConfirm({ ...M.confirmCopy('release_own', { team: t.name, when: when(t.starts_at), reviewTa: rt && rt.name }), onConfirm: async () => {
        await delay(500); const r = race('release_own'); if (r === 'fails') throw new Error('fail');
        setConfirm(null); if (r) return conflict('release_own', r, {});
        mutate((w) => { w.slots.forEach((s) => { if (s.teamId === t.project_id) s.teamId = null; }); w.teams[t.project_id].review_ta = null; });
        toast('success', M.successCopy('release_own', { when: when(t.starts_at) })); refetch();
      } });
    },
    sign_up: (slot) => withRow(slot, 'sign_up', () => {
      const id = slot.team.project_id, name = slot.team.name;
      const r = race('sign_up'); if (r === 'fails') return toast('error', 'That didn’t work. Try again.');
      // the request carries the slot the TA saw (slot.id); the server answers 409 when the team has moved since
      if (r === 'moved') {
        let moved = null;
        mutate((w) => { const free = w.slots.find((s) => !s.teamId && new Date(s.starts_at) > now); if (free) { w.slots.forEach((s) => { if (s.teamId === id) s.teamId = null; }); free.teamId = id; moved = { ...free }; } });
        if (!moved) return conflict('sign_up', 'ta_taken', { teamId: id, teamName: name });
        const at = when(moved.starts_at);
        setAlert({ text: M.errorCopy('sign_up', { status: 409, detail: 'This team moved to another slot.' }, { team: name, when: at }),
          actions: <Button size="sm" variant="outline" onClick={() => { setAlert(null); actions.sign_up({ id: moved.id, starts_at: moved.starts_at, team: { project_id: id, name } }); }}>Sign up for {at}</Button> });
        setLast('409 · This team moved to another slot.');
        return refetch();
      }
      if (r) return conflict('sign_up', r, { teamId: id, teamName: name });
      mutate((w) => { w.teams[id].review_ta = { user_id: p.viewerId, name: p.viewer.user.name }; });
      setAlert(null); toast('success', M.successCopy('sign_up', { team: name, when: when(slot.starts_at) })); refetch();
    }),
    step_down: (slot) => {
      const id = slot.team.project_id, name = slot.team.name;
      setConfirm({ ...M.confirmCopy('step_down', { team: name, when: when(slot.starts_at) }), onConfirm: async () => {
        await delay(450); if (race('step_down') === 'fails') throw new Error('fail');
        setConfirm(null); mutate((w) => { w.teams[id].review_ta = null; }); toast('success', M.successCopy('step_down', { team: name })); refetch();
      } });
    },
    open_review: (slot) => { setWsTeam(slot.team.project_id); setView('workspace'); },
    join: () => setLast('join · shared Zoom room'),
    place_team: (slot) => setDialog({ kind: 'place_team', slot }),
    review_ta: (slot, team) => setDialog({ kind: 'review_ta', team: team || { ...teamsById[slot.team.project_id], project_id: slot.team.project_id, starts_at: slot.starts_at, slot_id: slot.id } }),
    move_team: (slot) => setDialog({ kind: 'move_team', team: { ...teamsById[slot.team.project_id], project_id: slot.team.project_id, starts_at: slot.starts_at, slot_id: slot.id } }),
    release_team: (slot) => {
      const id = slot.team.project_id, t = teamsById[id] || {}, name = slot.team.name;
      const passed = M.slotPhase(slot.starts_at, now) !== 'upcoming';
      setConfirm({ ...M.confirmCopy('release_team', { team: name, when: when(slot.starts_at), reviewTa: t.review_ta && t.review_ta.name, passed }), onConfirm: async () => {
        await delay(500); if (race('release_team') === 'fails') throw new Error('fail');
        setConfirm(null); mutate((w) => { w.slots.forEach((s) => { if (s.teamId === id) s.teamId = null; }); w.teams[id].review_ta = null; });
        toast('success', M.successCopy('release_team', { team: name, reviewTa: t.review_ta && t.review_ta.name })); refetch();
      } });
    },
    delete: async (slot) => {
      await delay(350);
      if (race('delete')) return conflict('delete', 'taken', { slot });
      const copy = { ...slot }; delete copy.team;
      mutate((w) => { w.slots = w.slots.filter((s) => s.id !== slot.id); });
      toast('success', M.successCopy('delete', { when: when(slot.starts_at) }), { actionLabel: 'Undo', onAction: () => { mutate((w) => { if (!w.slots.some((s) => s.id === slot.id)) w.slots.push({ id: slot.id, starts_at: slot.starts_at, duration_minutes: 60, teamId: null }); }); setLast('undo · slot posted again'); } });
      refetch();
    },
  };
  const onAction = (action, slot, v, e) => {
    if ((action === 'open_review' || action === 'join') && e && e.preventDefault) e.preventDefault();
    setLast(`${action} · ${slot.team ? slot.team.name : M.whenText(slot.starts_at, { zone })}`);
    if (actions[action]) actions[action](slot);
  };
  const onDayAction = (action, g) => {
    const free = g.slots.filter((s) => !s.team && M.slotPhase(s.starts_at, now) === 'upcoming');
    const label = M.fmtSlotWhen(g.slots[0].starts_at, { zone }).dayLong;
    setConfirm({ ...M.confirmCopy('delete_day', { count: free.length, held: g.booked, day: label }), onConfirm: async () => {
      await delay(450); setConfirm(null);
      const ids = new Set(free.map((s) => s.id)); mutate((w) => { w.slots = w.slots.filter((s) => !ids.has(s.id)); });
      toast('success', M.successCopy('delete_day', { count: free.length, when: label })); refetch();
    } });
  };
  const confirmDialog = async (value) => {
    const d = dialog;
    await delay(550);
    const r = race(d.kind === 'review_ta' ? 'review_ta' : d.kind === 'move_team' ? 'move_team' : 'place');
    if (r === 'fails') throw new Error('That didn’t work. Try again.');
    if (d.kind === 'review_ta') {
      const id = d.team.project_id, ta = value.userId ? S.class_tas.tas.find((x) => x.id === value.userId) : null;
      mutate((w) => { w.teams[id].review_ta = ta ? { user_id: ta.id, name: ta.name } : null; });
      setDialog(null); toast('success', M.successCopy('review_ta', { team: d.team.name, reviewTa: ta && ta.name })); return refetch();
    }
    const slotId = value.slotId || (d.slot && d.slot.id);
    const projectId = value.projectId || (d.team && d.team.project_id);
    const target = worldRef.current.slots.find((s) => s.id === slotId);
    setDialog(null);
    if (r) return conflict(d.kind === 'move_team' ? 'move_team' : 'place', r, { slot: target });
    const t = worldRef.current.teams[projectId];
    const moved = worldRef.current.slots.some((s) => s.teamId === projectId);
    const dropped = moved && t.review_ta ? t.review_ta : null;
    mutate((w) => { w.slots.forEach((s) => { if (s.teamId === projectId) s.teamId = null; }); w.slots.find((s) => s.id === slotId).teamId = projectId; if (moved) w.teams[projectId].review_ta = null; });
    const msg = moved ? M.successCopy('move_team', { team: t.name, when: when(target.starts_at), reviewTa: dropped && dropped.name }) : M.successCopy('place', { team: t.name, when: when(target.starts_at) });
    toast('success', msg, dropped ? { actionLabel: 'Appoint again', onAction: () => { mutate((w) => { w.teams[projectId].review_ta = dropped; }); toast('success', M.successCopy('review_ta', { team: t.name, reviewTa: dropped.name })); } } : {});
    refetch();
  };
  const onToggleSignups = async (open) => {
    if (!open) {
      return setConfirm({ ...M.confirmCopy('close_signups'), onConfirm: async () => { await delay(450); setConfirm(null); mutate((w) => { w.signupsOpen = false; }); toast('success', M.successCopy('signups', { open: false })); refetch(); } });
    }
    setHeadBusy('signups'); await delay(450); setHeadBusy(null);
    mutate((w) => { w.signupsOpen = true; }); toast('success', M.successCopy('signups', { open: true })); refetch();
  };
  const onSaveZoom = async (url) => { setHeadBusy('zoom'); await delay(450); setHeadBusy(null); mutate((w) => { w.zoomUrl = url; }); toast('success', M.successCopy('zoom', { cleared: !url })); };
  const onPost = async (payload, draft) => {
    await delay(650);
    if (race('post') === 'fails') throw new Error('Couldn’t post these times. Check the list and try again.');
    const fresh = draft.items.filter((i) => !i.posted);
    mutate((w) => { fresh.forEach((i) => w.slots.push({ id: `s-new-${i.key}`, starts_at: i.startsAt, duration_minutes: 60, teamId: null })); });
    setPosting(false); toast('success', M.successCopy('post', { created: fresh.length, sent: draft.count })); refetch();
  };
  const onUnbooked = (action, team) => {
    if (action === 'place_on_slot') setDialog({ kind: 'place_on_slot', team });
    else setDialog({ kind: 'review_ta', team: { ...team, starts_at: null } });
  };

  /* ── pages ────────────────────────────────────────────────────────── */
  const student = !staff;
  const counts = M.boardCounts(p.reviewSlots, teamsById);
  const board = (
    <div className="fr-page">
      {status !== 'error' && (
        <FinalReviewsHeader lens={p.lens} signupsOpen={p.reviewSlots.signups_open} counts={counts} myReviewCount={p.schedule ? p.schedule.my_review_count : 0}
          zoomUrl={p.reviewSlots.review_zoom_url} complete={world.complete} status={status === 'loading' ? 'loading' : 'ready'} busy={headBusy}
          onPostSlots={() => setPosting(true)} onToggleSignups={onToggleSignups} onSaveZoom={onSaveZoom} />
      )}
      {student && status !== 'error' && (
        <TeamReview myTeam={p.myTeam} slots={p.reviewSlots.slots} signupsOpen={p.reviewSlots.signups_open} complete={world.complete} now={now} zone={zone}
          status={status === 'loading' ? 'loading' : 'ready'} busy={busy && busy.action === 'release' ? 'release' : null}
          onChooseSlot={() => { setFilter('free'); scrollToBoard(); }} onChangeSlot={() => { setFilter('free'); scrollToBoard(); }} onRelease={() => actions.release_own()} onJoin={(e) => { if (e && e.preventDefault) e.preventDefault(); setLast('join · own review'); }} />
      )}
      <div className="fr-board-anchor">
        <SlotBoard data={status === 'loading' ? null : p.reviewSlots} schedule={p.schedule} lens={p.lens} viewerId={p.viewerId} now={now} zone={zone} complete={world.complete}
          status={status} filter={filter} onFilterChange={setFilter} alert={alert && (alert.text || alert)} alertActions={alert && alert.actions} onDismissAlert={() => setAlert(null)} busy={busy}
          onAction={onAction} onDayAction={onDayAction} onRetry={() => { setDataKey('loading'); setTimeout(() => changeData('ready'), 700); }} onPostSlots={() => setPosting(true)}
          reviewHref={(t) => `#review/${t.project_id}`} />
      </div>
      {staff && status === 'ready' && !world.complete && <UnbookedTeams teams={M.unbookedTeams(p.reviewSlots, teamsById)} lens={p.lens} onAction={onUnbooked} />}
      {staff && status === 'ready' && world.complete && <p className="fr-note">A complete class: no teams without a slot to place, no posting, no sign-ups switch.</p>}
    </div>
  );
  const page = view === 'project' ? <ProjectPage p={p} now={now} zone={zone} onBoard={goBoard} onRelease={() => actions.release_own()} />
    : view === 'workspace' ? <WorkspacePage p={p} world={world} teamId={wsTeam} now={now} zone={zone} onBack={() => setView('board')} onPick={setWsTeam} />
      : view === 'states' ? React.createElement(window.FinalReviewsStates, { zone })
        : board;
  const title = view === 'project' ? 'My Project' : view === 'states' ? 'Final Reviews — states' : 'Final Reviews';
  const shell = (phone) => (
    <Shell phone={phone} lens={p.lens} viewer={p.viewer} title={title} active={view === 'project' ? 'project' : 'board'} preview={p.lens === 'preview'} contentRef={contentRef}
      onNav={(to) => setView(to === 'project' ? 'project' : 'board')} classLabel={classLabel}>
      {page}
    </Shell>
  );
  const staffDialogTeams = M.unbookedTeams(p.reviewSlots, teamsById);
  const Opt = ({ on, onClick, children }) => <Button variant="outline" size="sm" pressed={on} onClick={onClick}>{children}</Button>;
  return (
    <div className="fr-root">
      {confirm && <ConfirmDialog open title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} busyLabel={confirm.busyLabel} destructive={confirm.destructive}
        onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}
      {dialog && <SlotActionDialog open kind={dialog.kind} slot={dialog.slot} team={dialog.team} slots={p.reviewSlots.slots} unbooked={staffDialogTeams} teamsById={teamsById}
        tas={S.class_tas.tas} reviewCounts={Object.fromEntries(S.class_tas.tas.map((t) => [t.id, Object.values(world.teams).filter((x) => x.review_ta && x.review_ta.user_id === t.id).length]))}
        now={now} zone={zone} onConfirm={confirmDialog} onCancel={() => setDialog(null)} />}
      <PostSlotsDrawer open={posting} onClose={() => setPosting(false)} onPost={onPost} existing={p.reviewSlots.slots} now={now} zone={zone} defaultDay="2026-12-09" />
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      <div className="fr-demo" role="toolbar" aria-label="Demo controls">
        <label className="fr-demo__group"><span className="fr-demo__lbl">viewer</span>
          <select className="fr-demo__select" value={viewerKey} onChange={(e) => { setViewerKey(e.target.value); setAlert(null); setFilter('all'); }}>
            {Object.values(F.VIEWERS).map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
          </select>
        </label>
        <span className="fr-demo__group"><span className="fr-demo__lbl">view</span>{['board', 'project', 'workspace', 'states'].map((v) => <Opt key={v} on={view === v} onClick={() => setView(v)}>{v}</Opt>)}</span>
        <span className="fr-demo__group"><span className="fr-demo__lbl">clock</span>{[['booking_week', 'booking week'], ['review_day', 'review day'], ['after', 'after']].map(([k, l]) => <Opt key={k} on={clock === k} onClick={() => changeClock(k)}>{l}</Opt>)}</span>
        <span className="fr-demo__group"><span className="fr-demo__lbl">zone</span>{Object.keys(ZONES).map((k) => <Opt key={k} on={zoneKey === k} onClick={() => setZoneKey(k)}>{ZONES[k].label}</Opt>)}</span>
        <label className="fr-demo__group"><span className="fr-demo__lbl">data</span>
          <select className="fr-demo__select" value={dataKey} onChange={(e) => changeData(e.target.value)}>
            {[['ready', 'ready'], ['empty', 'empty (no slots)'], ['loading', 'loading'], ['error', 'error'], ['many', 'many (40 slots)'], ['history', 'pre-slots class']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <span className="fr-demo__group"><span className="fr-demo__lbl">sign-ups</span><Opt on={world.signupsOpen} onClick={() => mutate((w) => { w.signupsOpen = true; })}>open</Opt><Opt on={!world.signupsOpen} onClick={() => mutate((w) => { w.signupsOpen = false; })}>closed</Opt></span>
        <label className="fr-demo__group"><span className="fr-demo__lbl">next request</span>
          <select className="fr-demo__select" value={apiMode} onChange={(e) => setApiMode(e.target.value)}>
            {[['ok', 'succeeds'], ['taken', '409 slot just taken'], ['started', '409 slot started'], ['closed', '403 sign-ups closed'], ['passed', '403 review time passed'], ['ta_taken', '409 another TA signed up'], ['moved', '409 team moved (TA sign-up)'], ['fails', 'network error']].map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <span className="fr-demo__group"><span className="fr-demo__lbl">viewport</span><Opt on={viewport === 'desktop'} onClick={() => setViewport('desktop')}>desktop</Opt><Opt on={viewport === 'phone'} onClick={() => setViewport('phone')}>phone</Opt></span>
        {last && <span className="fr-demo__log">→ {last}</span>}
      </div>
      <div className={viewport === 'phone' ? 'fr-stage fr-stage--phone' : 'fr-stage'}>{shell(viewport === 'phone')}</div>
    </div>
  );
}
window.FinalReviewsApp = FinalReviewsApp;

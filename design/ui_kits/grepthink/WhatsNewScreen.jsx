/* GrepThink — What's new (2026-10-23): the landing page and the app shell with the release notes modal, the header's
   ⓘ tab and the profile menu on the kit. Two modes in one file: the shell (demo bar + a framed stage at the chosen
   width) and ?stage (the composition itself, so the header's media queries see a real viewport). */
const NS = window.GrepThinkDesignSystem_36e7e3;
const { LandingHeader, Hero, AnnouncementPill, WhatsNewModal, ProfileMenu, ReleasesModel, UnreadBadge } = NS;
const RELEASES = ReleasesModel.releasesFromNotes(window.GT_RELEASE_NOTES_SAMPLE); // 0.92.0 · 0.91.1 · 0.91.0
const CURRENT = RELEASES[0].version;
const LOGO = '../../assets/grepthink-logo.svg';
const params = new URLSearchParams(location.search);
const SEEN = { first: null, partial: '0.91.0', all: CURRENT };
const PERSONAS = {
  student: { name: 'Ashton Liu' },
  instructor: { name: 'Priya Raman', teaching: true },
  preview: { name: 'Priya Raman', teaching: true, previewing: true },
  schools: { name: 'Jordan Lee', schools: [{ id: 'ucsc', name: 'UC Santa Cruz' }, { id: 'cabrillo', name: 'Cabrillo College' }], currentSchoolId: 'ucsc' },
};
const I = ({ d, size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const Bell = () => <I d={<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>} />;
const Search = () => <I size={16} d={<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></>} />;
const Burger = () => <I size={22} d={<path d="M4 6h16M4 12h16M4 18h16" />} />;

/* The seen store, in memory for the kit (the app keeps it in localStorage['gt:whats-new:seen']): opening the modal marks
   the current version seen and clears every dot, while the modal keeps the lastSeen it opened with. */
function useWhatsNew(initialSeen) {
  const startOpen = params.get('open') === '1'; // the demo bar's "Modal: open" counts as an opening: it marks the version seen
  const [seen, setSeen] = React.useState(startOpen ? CURRENT : initialSeen);
  const [open, setOpen] = React.useState(startOpen);
  const [lastSeenAtOpen, setLastSeenAtOpen] = React.useState(initialSeen);
  const openModal = () => { setLastSeenAtOpen(seen); setSeen(CURRENT); setOpen(true); };
  return { unseen: ReleasesModel.isUnseen(CURRENT, seen), open, openModal, close: () => setOpen(false), lastSeenAtOpen };
}

function LandingStage({ hdr, seen }) {
  const wn = useWhatsNew(seen);
  return (
    <div className="wn-landing">
      <LandingHeader logoSrc={LOGO} scrolled={hdr === 'pill'} onWhatsNew={wn.openModal} whatsNewUnseen={wn.unseen} />
      <Hero compact announcement={<AnnouncementPill href="#scrum-board">Scrum boards and team channels</AnnouncementPill>}
        title="Build better project teams," titleAccent="all in one place"
        subtitle="grepthink helps instructors and student teams form balanced teams, track weekly progress, and keep everyone accountable without the spreadsheet chaos." />
      <div className="wn-landing__band">
        {['Smart team formation', 'Weekly status reports', 'Scrum boards and channels'].map((t) => <div key={t} className="wn-card"><h2>{t}</h2><p>One of the landing page's feature columns. The header's tab opens What's new in the dark look.</p></div>)}
      </div>
      <WhatsNewModal open={wn.open} onClose={wn.close} tone="dark" releases={RELEASES} currentVersion={CURRENT} lastSeen={wn.lastSeenAtOpen} status="ready" />
    </div>
  );
}

function AppStage({ seen, persona }) {
  const wn = useWhatsNew(seen);
  const p = PERSONAS[persona] || PERSONAS.student;
  const [previewing, setPreviewing] = React.useState(!!p.previewing);
  const [school, setSchool] = React.useState(p.currentSchoolId);
  return (
    <div className="wn-app">
      <aside className="wn-side" aria-label="Sidebar">
        <img className="wn-side__logo" src={LOGO} alt="grepthink" />
        <button type="button" className="wn-class"><span>CSE 115C · Fall 2026</span><span>▾</span></button>
      </aside>
      <div className="wn-main">
        {previewing && <div className="wn-banner">Previewing the class as a student. Pick “Instructor view” in the profile menu to go back.</div>}
        <header className="wn-header">
          <button type="button" className="wn-header__menu" aria-label="Open menu"><Burger /></button>
          <h1 className="wn-header__title">Home</h1>
          <div className="wn-header__right">
            <button type="button" className="wn-header__icon" aria-label="Notifications, 3 unread"><Bell /><UnreadBadge count={3} style={{ position: 'absolute', top: -6, right: -6 }} /></button>
            <button type="button" className="wn-header__search" aria-label="Search (⌘K)"><Search /><span>Search</span><kbd>⌘K</kbd></button>
            <ProfileMenu name={p.name} schools={p.schools} currentSchoolId={school} onPickSchool={setSchool} teaching={p.teaching} previewing={previewing}
              onTogglePreview={() => setPreviewing((v) => !v)} onSettings={() => {}} onWhatsNew={wn.openModal} onLogout={() => {}} unseen={wn.unseen} />
          </div>
        </header>
        <main className="wn-content">
          <h2 className="wn-content__welcome">Welcome back, {p.name.split(' ')[0]}</h2>
          <div className="wn-content__grid">
            <div className="wn-card"><h2>Today's schedule</h2><p>Sprint 3 planning at 3:00 PM · TA meeting at 4:30 PM.</p></div>
            <div className="wn-card"><h2>Your team</h2><p>Bike Share Map · five members · Sprint 3 of 5.</p></div>
            <div className="wn-card"><h2>Assignments</h2><p>TSR 4 due Friday · Interest form closed.</p></div>
          </div>
        </main>
      </div>
      <WhatsNewModal open={wn.open} onClose={wn.close} tone="light" releases={RELEASES} currentVersion={CURRENT} lastSeen={wn.lastSeenAtOpen} status="ready" />
    </div>
  );
}

function Stage() {
  const ctx = params.get('ctx') || 'landing';
  const seen = SEEN[params.get('seen') || 'first'] ?? null;
  return ctx === 'app' ? <AppStage seen={seen} persona={params.get('persona') || 'student'} /> : <LandingStage hdr={params.get('hdr') || 'bar'} seen={seen} />;
}

const Group = ({ label, value, options, onChange, disabled }) => (
  <span className="wn-demo__group" role="group" aria-label={label} aria-disabled={disabled || undefined}>
    <span className="wn-demo__lbl">{label}</span>
    {options.map(([v, l]) => <button key={v} type="button" className="wn-demo__opt" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
  </span>
);

function Shell() {
  const [s, setS] = React.useState({ ctx: 'landing', hdr: 'bar', w: 1280, seen: 'first', persona: 'student', open: '0' });
  const set = (k) => (v) => setS((prev) => ({ ...prev, [k]: v }));
  const src = `whats-new.html?stage&ctx=${s.ctx}&hdr=${s.hdr}&seen=${s.seen}&persona=${s.persona}&open=${s.open}`;
  return (
    <div className="wn-shell">
      <iframe key={src} className="wn-shell__frame" src={src} style={{ width: s.w }} title={`What's new — ${s.ctx} at ${s.w}px`} />
      <div className="wn-demo" role="toolbar" aria-label="Demo controls">
        <Group label="Context" value={s.ctx} onChange={set('ctx')} options={[['landing', 'Landing'], ['app', 'App']]} />
        <Group label="Header" value={s.hdr} onChange={set('hdr')} disabled={s.ctx !== 'landing'} options={[['bar', 'Bar'], ['pill', 'Pill']]} />
        <Group label="Width" value={s.w} onChange={set('w')} options={[[1280, '1280'], [768, '768'], [560, '560'], [375, '375'], [320, '320']]} />
        <Group label="Seen" value={s.seen} onChange={set('seen')} options={[['first', 'First visit'], ['partial', 'Up to 0.91.0'], ['all', 'All seen']]} />
        <Group label="Persona" value={s.persona} onChange={set('persona')} disabled={s.ctx !== 'app'} options={[['student', 'Student'], ['instructor', 'Instructor'], ['preview', 'Preview'], ['schools', 'Two schools']]} />
        <Group label="Modal" value={s.open} onChange={set('open')} options={[['0', 'Closed'], ['1', 'Open']]} />
      </div>
    </div>
  );
}

window.WhatsNewApp = params.has('stage') ? Stage : Shell;

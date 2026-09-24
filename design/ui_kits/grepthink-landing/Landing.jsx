/* grepthink2.com — full landing page composed from components/marketing + the stages. */
const NS2 = window.GrepThinkDesignSystem_36e7e3;
const { LandingHeader, Hero, FloatingCards, AnnouncementPill, FeatureColumn, PreviewWindow, Spotlight, ClosingBand, LandingFooter } = NS2;
const { ScrumStage, MessagingStage, AssistantStage } = window;

const LOGO = '../../assets/grepthink-logo.svg';
const PREVIEW = '../../assets/landing/landing-preview.png';
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Launch settings — mirrors landing.config.ts */
const CONFIG = { announcement: true, badges: { scrum: 'NEW', messaging: 'NEW', assistant: 'SOON' } };

const L = ({ d, size = 17 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d.split('|').map((p, i) => <path key={i} d={p} />)}</svg>;
const ICONS = {
  move: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20',
  scale: 'M4 9h16M4 15h16M10 3L8 21M16 3l-2 18',
  branch: 'M6 9v6a3 3 0 003 3h6M18 15V9|M18 21a3 3 0 100-6 3 3 0 000 6z|M6 9a3 3 0 100-6 3 3 0 000 6z',
  trend: 'M22 7l-8.5 8.5-5-5L2 17|M16 7h6v6',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M9 11a4 4 0 100-8 4 4 0 000 8z|M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  link: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  bell: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20z|M12 6v6l4 2',
  check: 'M20 6L9 17l-5-5',
  users20: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2|M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M22 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75',
  listchecks: 'm3 17 2 2 4-4|m3 7 2 2 4-4|M13 6h8|M13 12h8|M13 18h8',
  clipboard: 'M8 2h8a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z|M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2|M12 11h4|M12 16h4|M8 11h.01|M8 16h.01',
};

/* IntersectionObserver: `seen` latches once at `threshold`; `visible` tracks live. */
function useInView(ref, threshold) {
  const [seen, setSeen] = React.useState(REDUCED);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || REDUCED || !('IntersectionObserver' in window)) { setSeen(true); setVisible(true); return undefined; }
    const io = new IntersectionObserver(([e]) => { setVisible(e.isIntersecting); if (e.intersectionRatio >= threshold) setSeen(true); }, { threshold: [0, threshold] });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return { seen, visible };
}

/* One band: reveal (30%) → settle → moment (50%, +0.4s, once). */
function Band({ children, renderStage, ...spot }) {
  const ref = React.useRef(null);
  const reveal = useInView(ref, 0.3);
  const moment = useInView(ref, 0.5);
  const [phase, setPhase] = React.useState(REDUCED ? 'settled' : 'idle');
  const [play, setPlay] = React.useState(REDUCED);
  React.useEffect(() => { if (reveal.seen && phase === 'idle') { setPhase('seen'); const t = setTimeout(() => setPhase('settled'), 700); return () => clearTimeout(t); } }, [reveal.seen, phase]);
  React.useEffect(() => { if (moment.seen && phase === 'settled' && !play) { const t = setTimeout(() => setPlay(true), 400); return () => clearTimeout(t); } }, [moment.seen, phase, play]);
  return (
    <div ref={ref}>
      <Spotlight reveal={phase} {...spot}>{renderStage({ play, paused: !reveal.visible })}</Spotlight>
    </div>
  );
}

function LandingPage() {
  const [approved, setApproved] = React.useState(REDUCED);
  return (
    <div className="lk-page">
      <LandingHeader logoSrc={LOGO} homeHref="#" ctaHref="#" signInHref="#" links={[{ label: 'Features', href: '#scrum-board' }, { label: 'Contact', href: 'contact.html' }]} />
      <main>
        <Hero
          announcement={CONFIG.announcement ? <AnnouncementPill href="#scrum-board" badge="NEW" ariaLabel="New: scrum boards and team channels. Jump to the scrum board section">Scrum boards and team channels</AnnouncementPill> : null}
          eyebrow={CONFIG.announcement ? null : 'For instructors and student teams'}
          title="Build better project teams," titleAccent="all in one place"
          subtitle={CONFIG.announcement
            ? 'grepthink helps instructors and student teams form balanced teams, track weekly progress, and keep everyone accountable without the spreadsheet chaos.'
            : 'grepthink helps classes form balanced teams, track weekly progress, and keep everyone accountable without the spreadsheet chaos.'}
          ctaHref="#" signInHref="#" decor={<FloatingCards />} />

        <section className="gt-solutions" id="solutions">
          <div className="gt-solutions__inner">
            <h2 className="gt-solutions__heading">Everything your class needs</h2>
            <p className="gt-solutions__sub">From the first roster to the final demo, grepthink keeps team projects organized and accountable.</p>
            <div className="gt-solutions__columns">
              <FeatureColumn icon={<L d={ICONS.users20} size={20} />} title="Smart team formation">Balance teams by interests and skills, so no group is stacked and no student is stranded.</FeatureColumn>
              <FeatureColumn icon={<L d={ICONS.listchecks} size={20} />} title="Rosters & assignments">Manage enrollment, projects, and coursework from one place, no more juggling spreadsheets.</FeatureColumn>
              <FeatureColumn icon={<L d={ICONS.clipboard} size={20} />} title="Weekly status reports">Students log progress each week with TSRs; instructors see exactly who is on track at a glance.</FeatureColumn>
            </div>
            <PreviewWindow src={PREVIEW} alt="grepthink app preview — the scrum board for Sprint 3" />
          </div>
        </section>

        <Band id="scrum-board" eyebrow="Scrum board" badge={CONFIG.badges.scrum} heading="Run every sprint from" headingAccent="one board"
          lead="Break your project into sprints, user stories and tasks. Drag work across the board, estimate it in points, and link each task to its pull request. Every move is logged, so your TA sees progress as it happens."
          bullets={[
            { icon: <L d={ICONS.move} />, text: 'Drag-and-drop board with a history of every move' },
            { icon: <L d={ICONS.scale} />, text: "Story points and time estimates, on your team's own scale" },
            { icon: <L d={ICONS.branch} />, text: 'Tasks linked to GitHub and git.ucsc.edu pull requests' },
            { icon: <L d={ICONS.trend} />, text: 'Burnup charts for each sprint and the whole project' },
          ]}
          side="right" hairline
          renderStage={({ play }) => <ScrumStage play={play} />} />

        <Band id="messaging" eyebrow="Messaging" badge={CONFIG.badges.messaging} heading="One inbox for your team and" headingAccent="course staff"
          lead="Every project gets three channels: one for the team, one with your TA and one with your instructor. Direct messages cover everything else. Messages and notifications arrive live, with unread counts wherever you are in the app."
          bullets={[
            { icon: <L d={ICONS.users} />, text: 'Team, TA and Instructor channels for every project' },
            { icon: <L d={ICONS.chat} />, text: 'Direct messages with classmates and course staff' },
            { icon: <L d={ICONS.link} />, text: "Channels follow the roster: join a team and you're in" },
            { icon: <L d={ICONS.bell} />, text: 'Live notifications for messages, join requests and team changes' },
          ]}
          side="left" alt
          renderStage={({ play }) => <MessagingStage play={play} />} />

        <Band id="project-assistant" eyebrow="Project assistant" badge={CONFIG.badges.assistant} tone="amber" heading="A board that keeps up with" headingAccent="your code"
          lead="The assistant will read your pull requests and commits and suggest the board updates they imply: move a task to Done when its PR merges, flag work that has stalled, link PRs that aren't on the board. Nothing changes until someone on the team approves it."
          bullets={[
            { icon: <L d={ICONS.branch} />, text: 'Suggests board moves from merged PRs and commits' },
            { icon: <L d={ICONS.clock} />, text: 'Flags stalled tasks and PRs with no task' },
            { icon: <L d={ICONS.check} />, text: 'Proposes changes, never makes them on its own' },
          ]}
          note={{ title: 'For TAs and instructors', text: "Each week it compares status reports with the tasks and PRs each student actually closed, and points out where they don't line up, so reviews start from evidence." }}
          link={{ label: 'Want early access? Get in touch', href: 'contact.html' }}
          side="right"
          renderStage={({ play }) => <AssistantMoment play={play} approved={approved} setApproved={setApproved} />} />

        <ClosingBand text="Create a class and import your roster. Every team gets a scrum board and its own channels from day one." ctaHref="#" secondaryHref="contact.html" />
      </main>
      <LandingFooter logoSrc={LOGO} columns={[
        { title: 'Product', links: [{ label: 'Get started', href: '#' }, { label: 'Solutions', href: '#solutions' }, { label: 'Scrum board', href: '#scrum-board' }, { label: 'Messaging', href: '#messaging' }, { label: 'Project assistant', href: '#project-assistant' }] },
        { title: 'Account', links: [{ label: 'Sign in', href: '#' }, { label: 'Create account', href: '#' }] },
        { title: 'Company', links: [{ label: 'Contact', href: 'contact.html' }] },
      ]} />
    </div>
  );
}

/* The assistant moment: Approve "presses" at 0.8s, the card collapses at 1.3s. */
function AssistantMoment({ play, approved, setApproved }) {
  React.useEffect(() => { if (play && !approved) { const t = setTimeout(() => setApproved(true), 1300); return () => clearTimeout(t); } }, [play, approved]);
  return <AssistantStage play={play} approved={approved} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<LandingPage />);

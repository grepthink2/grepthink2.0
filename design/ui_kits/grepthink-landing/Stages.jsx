/* Decorative stage compositions for the three spotlight bands (grepthink2.com).
   Static, fictional, aria-hidden by <Stage>. They wrap design-system anatomy
   (TagBadge, PointsChip, EstimateChip, PRLinkChip, UserPair, TypingIndicator,
   assistant cards) in StageCard shells. `play` fires each band's one moment. */
const NS = window.GrepThinkDesignSystem_36e7e3;
const { Stage, StageCard, TagBadge, PointsChip, EstimateChip, PRLinkChip, UserPair, TypingIndicator,
        AssistantSuggestionCard, StalledFlag, ReportCheckCard, UnlinkedPRChip, AVATAR_COLORS } = NS;

const Icon = ({ d, size = 11, sw = 2.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const CHAT = 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z';
const HISTORY = 'M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3';
const SEND = 'M22 2L11 13M22 2l-7 20-4-9-9-4z';

const MiniRow = ({ k, pts, title, className = '' }) => (
  <div className={`lk-row ${className}`}><div className="lk-row__k">{k}<b>{pts}</b></div><div className="lk-row__t">{title}</div></div>
);

/* ── Band 1 · Scrum board ─────────────────────────────────── */
function ScrumStage({ play, done }) {
  return (
    <Stage className={play ? 'is-playing' : ''} data-done={done || undefined}>
      <StageCard tilt={-2} floatY={-10} floatDur={8} order={0} title="Sprint 3" meta="4 days left" style={{ left: 18, top: 34, width: 360, zIndex: 2 }}>
        <div className="lk-cols">
          <div className="lk-col"><div className="lk-col__h"><span className="lk-dot" style={{ background: 'var(--gt-gray-400)' }} />TODO<span className="lk-col__n">2</span></div>
            <MiniRow k="GT-15" pts={2} title="Invite flow copy" /><MiniRow k="GT-16" pts={5} title="Export grades CSV" /></div>
          <div className="lk-col"><div className="lk-col__h"><span className="lk-dot" style={{ background: 'var(--gt-accent)' }} />In Progress<span className="lk-col__n">2</span></div>
            <div className="lk-spacer" /><MiniRow k="GT-9" pts={3} title="Attendance tab" /></div>
          <div className="lk-col"><div className="lk-col__h"><span className="lk-dot" style={{ background: 'var(--gt-primary)' }} />Done<span className="lk-col__n lk-count"><span className="lk-count__a">3</span><span className="lk-count__b">4</span>&nbsp;</span></div>
            <div className="lk-spacer" /><MiniRow k="GT-7" pts={2} title="Login page" /><MiniRow k="GT-8" pts={3} title="Team channels" /></div>
          <MiniRow k="GT-12" pts={3} title="Roster API" className="lk-mover" />
        </div>
      </StageCard>

      <StageCard tilt={3} floatY={9} floatDur={9} order={1} mobile style={{ right: 14, top: 196, width: 262, zIndex: 3 }}>
        <div className="lk-task__top">
          <span className="lk-task__key">GT-12</span><span className="lk-task__story">GT-4</span>
          <span style={{ marginLeft: 'auto' }}><EstimateChip estimate="6h" /></span><PointsChip points={3} size="sm" />
        </div>
        <p className="lk-task__title">Connect the class roster API</p>
        <div className="lk-task__tags"><TagBadge tag="backend" /><TagBadge tag="frontend" /></div>
        <div className="lk-task__foot">
          <UserPair reporter="Priya Shah" assignee="Jordan L." />
          <span className="lk-task__right"><span className="lk-task__cm"><Icon d={CHAT} />4</span><PRLinkChip label="#41 merged" url="#" state="merged" /></span>
        </div>
        <div className="lk-task__audit"><Icon d={HISTORY} size={10} />Moved to <b>Done</b> · Jordan · just now</div>
      </StageCard>

      <StageCard tilt={-3} floatY={-8} floatDur={9.5} order={2} tabletHide title="Sprint burnup" meta={<span className="lk-burn__stat"><strong>18</strong>/24 pts</span>} style={{ left: 58, bottom: 22, width: 250, zIndex: 1 }}>
        <svg viewBox="0 0 200 86" preserveAspectRatio="none" className="lk-burn__svg">
          <line x1="0" x2="200" y1="21" y2="21" stroke="#f0f1f3" /><line x1="0" x2="200" y1="43" y2="43" stroke="#f0f1f3" /><line x1="0" x2="200" y1="64" y2="64" stroke="#f0f1f3" />
          <polygon className="lk-burn__area" points="0,86 0,78 33,70 66,58 100,44 133,36 166,28 166,86" />
          <polyline className="lk-burn__scope" points="0,26 66,26 66,14 200,14" />
          <polyline className="lk-burn__done" points="0,78 33,70 66,58 100,44 133,36 166,28" />
        </svg>
        <div className="lk-burn__legend"><span><i style={{ background: 'var(--gt-primary)' }} />Completed</span><span><i style={{ background: 'var(--gt-mkt-muted)' }} />Scope</span></div>
      </StageCard>
    </Stage>
  );
}

/* ── Band 2 · Messaging ───────────────────────────────────── */
const Pill = ({ kind, children }) => <span className={`lk-pill lk-pill--${kind}`}>{children}</span>;
const Av = ({ bg, sq, sm, children }) => <span className={['lk-av', sq ? 'lk-av--sq' : '', sm ? 'lk-av--sm' : ''].filter(Boolean).join(' ')} style={{ background: bg }}>{children}</span>;

function MessagingStage({ play }) {
  return (
    <Stage mirror className={play ? 'is-playing' : ''}>
      <StageCard tilt={-2} floatY={-10} floatDur={8} order={0} title="Messages" meta="3 unread" style={{ left: 24, top: 40, width: 318, zIndex: 1 }}>
        <div className="lk-conv lk-conv--hl"><Av bg={AVATAR_COLORS[0]} sq>SS</Av>
          <div className="lk-conv__b"><div className="lk-conv__n">ShoeShopper <Pill kind="team">Team</Pill></div>
            <div className="lk-conv__p"><span className="lk-swap-a">Standup moved to 3pm</span><span className="lk-swap-b">Jordan: Merged, thanks!</span></div></div>
          <div className="lk-conv__r"><span className="lk-conv__tm">2m</span><span className="lk-ub"><span className="lk-swap-a">2</span><span className="lk-swap-b">3</span>&nbsp;</span></div></div>
        <div className="lk-conv"><Av bg={AVATAR_COLORS[1]} sq>SS</Av>
          <div className="lk-conv__b"><div className="lk-conv__n">ShoeShopper <Pill kind="ta">TA</Pill></div><div className="lk-conv__p">Great demo today, see notes</div></div>
          <div className="lk-conv__r"><span className="lk-conv__tm">1h</span></div></div>
        <div className="lk-conv"><Av bg={AVATAR_COLORS[2]} sq>SS</Av>
          <div className="lk-conv__b"><div className="lk-conv__n">ShoeShopper <Pill kind="ins">Instructor</Pill></div><div className="lk-conv__p">Final review slot confirmed</div></div>
          <div className="lk-conv__r"><span className="lk-conv__tm">Tue</span></div></div>
        <div className="lk-conv"><Av bg={AVATAR_COLORS[3]}>PS</Av>
          <div className="lk-conv__b"><div className="lk-conv__n">Priya Shah</div><div className="lk-conv__p">Can you look at my PR?</div></div>
          <div className="lk-conv__r"><span className="lk-conv__tm">Mon</span></div></div>
      </StageCard>

      <StageCard tilt={2.5} floatY={9} floatDur={9} order={1} mobile title={<span>ShoeShopper <Pill kind="team">Team</Pill></span>} meta="5 members" style={{ right: 22, top: 176, width: 300, zIndex: 2 }}>
        <div className="lk-msgs">
          <div className="lk-mrow"><Av bg={AVATAR_COLORS[3]} sm>PS</Av><div className="lk-bub">Can someone review GT-12 before standup?<small>Priya · 10:02</small></div></div>
          <div className="lk-mrow lk-mrow--me"><div className="lk-bub lk-bub--me">On it. PR #41 is up.<small>You · 10:04</small></div></div>
          <div className="lk-mrow lk-live"><Av bg={AVATAR_COLORS[1]} sm>JL</Av>
            <div className="lk-slot"><div className="lk-typing"><TypingIndicator tone="soft" label="Jordan is typing" /></div><div className="lk-bub lk-landed">Merged, thanks!<small>Jordan · 10:09</small></div></div></div>
        </div>
        <div className="lk-comp">Message the team…<b><Icon d={SEND} size={12} /></b></div>
      </StageCard>
    </Stage>
  );
}

/* ── Band 3 · Project assistant (preview) ─────────────────── */
/* Desktop placement (build values): suggestion 288px wide, 25% from the top;
   stalled flag and report card 3% from the right edge. The suggestion is the
   phone card and stays `pending` there (no moment below 768px). */
function AssistantStage({ play, approved }) {
  const evidence = <React.Fragment>PR <b>#41</b> was merged into main.</React.Fragment>;
  return (
    <Stage variant="preview" className={play ? 'is-playing' : ''}>
      <StageCard tilt={3} floatY={9} floatDur={9} order={1} style={{ right: '3%', top: 20, width: 226, zIndex: 1, padding: 0 }}>
        <StalledFlag surface="landing" taskKey="GT-9" title="Attendance tab" days={6} detail="no commits" assignee="Sam" style={{ boxShadow: 'none' }} />
      </StageCard>
      <StageCard tilt={-2} floatY={-10} floatDur={8} order={0} mobile className={approved ? '' : 'lk-press'} style={{ left: 22, top: '25%', width: 288, zIndex: 2, padding: 0 }}>
        <AssistantSuggestionCard surface="landing" state={approved ? 'approved' : 'pending'} evidence={evidence} taskKey="GT-12" taskTitle="Connect the class roster API" target="Done" approvedBy="you" style={{ boxShadow: 'none' }} />
      </StageCard>
      <StageCard tilt={-2.5} floatY={-8} floatDur={9.5} order={2} tabletHide style={{ right: '3%', bottom: 30, width: 272, zIndex: 3, padding: 0 }}>
        <ReportCheckCard surface="landing" week="Week 5" project="ShoeShopper" rows={[{ kind: 'match', text: '4 reports match closed work' }, { kind: 'review', text: 'Alex: reports 35%, closed 1 of 6 tasks' }]} style={{ boxShadow: 'none' }} />
      </StageCard>
      <StageCard pill tilt={2} floatY={9} floatDur={10} order={3} tabletHide style={{ left: 16, bottom: 22, zIndex: 4 }}>
        <UnlinkedPRChip surface="bare" pr="PR #44" />
      </StageCard>
    </Stage>
  );
}

Object.assign(window, { ScrumStage, MessagingStage, AssistantStage });

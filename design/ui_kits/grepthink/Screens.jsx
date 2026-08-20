const NS = window.GrepThinkDesignSystem_36e7e3;
const { Card, Table, Badge, Button, StatCard, ProjectCard, RosterRow, IconButton, Pagination,
        AssignmentCard, TSRForm, TSRSummaryCard, ConversationListItem, MessageBubble,
        MessageComposer, MeetingCard, PieChartCard, BarChartCard, EmptyState, Tabs,
        JoinRequestCard, SegmentedControl } = NS;

/* ── Home ───────────────────────────────────────────────────── */
function HomeScreen({ persona }) {
  const deadlines = [
    { id: 1, name: 'TSR1', assignee: 'Joshua C.', due: 'Jan 18, 2026', project: 'GrepThink 2.0', s: <Badge tone="error">Due Soon</Badge> },
    { id: 2, name: 'TSR2', assignee: 'Tony W.', due: 'Jan 25, 2026', project: 'GrepThink 2.0', s: <Badge tone="neutral">Not Started</Badge> },
    { id: 3, name: 'TSR3', assignee: 'Landon N.', due: 'Feb 01, 2026', project: 'GrepThink 2.0', s: <Badge tone="success">Completed</Badge> },
  ];

  if (persona === 'instructor') {
    return (
      <div className="gtk-stack">
        <div className="gtk-grid4">
          <StatCard label="Students" value="62" hint="58 enrolled · 4 invited" accent="primary" />
          <StatCard label="Teams formed" value="12" hint="2 pending staffing" accent="blue" />
          <StatCard label="TSRs submitted" value="48/62" hint="14 outstanding" accent="amber" />
          <StatCard label="Join requests" value="5" hint="oldest 2 days" accent="purple" />
        </div>
        <div className="gtk-grid2">
          <Card title="TSR completion" shadow="hairline">
            <PieChartCard size={120} data={[{name:'Submitted',value:48},{name:'In progress',value:8},{name:'Missing',value:6}]} />
          </Card>
          <Card title="Team sizes" shadow="hairline">
            <BarChartCard height={110} data={[{name:'T1',value:5},{name:'T2',value:4},{name:'T3',value:5},{name:'T4',value:6},{name:'T5',value:4}]} />
          </Card>
        </div>
        <Card title="Pending join requests" shadow="hairline">
          <div className="gtk-stack" style={{gap:10}}>
            <JoinRequestCard name="Priya Raman" project="Slug Dining" timestamp="2d ago" onApprove={() => {}} onDeny={() => {}} />
            <JoinRequestCard name="Marcus Lee" project="GrepThink 2.0" timestamp="1d ago" message="Took 101 with Prof. J, comfortable in React." onApprove={() => {}} onDeny={() => {}} />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="gtk-stack">
      <div className="gtk-welcome">Welcome Back, Josh</div>
      <div className="gtk-grid-main">
        <Card title="Upcoming Deadlines" shadow="card" padded={false}>
          <Table
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'assignee', label: 'Assignee' },
              { key: 'due', label: 'Deadline' },
              { key: 'project', label: 'Project' },
              { key: 's', label: 'Status' },
            ]}
            rows={deadlines}
          />
        </Card>
        <Card shadow="card" padded={false}>
          <div className="gtk-group-head">Current Group</div>
          <div className="gtk-group-body">
            <div className="gtk-group-row">
              <span className="gtk-group-avatar">GT</span>
              <div>
                <div className="gtk-group-name">Grepthink 2.0</div>
                <div className="gtk-group-meta"><b>Product Owner:</b> Ashton Liu</div>
                <div className="gtk-group-pills">
                  <Badge tone="neutral">5 Members</Badge>
                  <Badge tone="neutral">Faculty Led</Badge>
                  <Badge tone="success">Incoming</Badge>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Projects ───────────────────────────────────────────────── */
function ProjectsScreen() {
  const [view, setView] = React.useState('cards');
  return (
    <div className="gtk-stack">
      <div className="gtk-toolbar">
        <SegmentedControl value={view} onChange={setView} options={[{value:'cards',label:'Cards'},{value:'table',label:'Table'}]} />
        <Button size="sm">Create Project</Button>
      </div>
      <div className="gtk-grid-cards">
        <ProjectCard name="Grepthink 2.0" team="Team 1" memberCount={4} status="Active" onView={() => {}} />
        <ProjectCard name="Slug Dining" team="Team 4" memberCount={5} status="Active" onView={() => {}} />
        <ProjectCard name="Campus Nav AR" team="Team 7" memberCount={3} status="Recruiting" statusTone="info" onView={() => {}} />
        <ProjectCard name="StudySpots" team="—" memberCount={0} status="Proposed" statusTone="neutral" onView={() => {}} />
      </div>
    </div>
  );
}

/* ── Assignments ────────────────────────────────────────────── */
function AssignmentsScreen() {
  return (
    <div className="gtk-stack">
      <div className="gtk-count-head"><h2>Assignments</h2><span className="gtk-count">4</span></div>
      <div className="gtk-stack" style={{gap:10}}>
        <AssignmentCard name="TSR 3" due="Feb 01, 2026" project="GrepThink 2.0" status="in_progress" onAction={() => {}} />
        <AssignmentCard name="Sprint 3 Demo" due="Feb 05, 2026" project="GrepThink 2.0" status="not_started" onAction={() => {}} />
        <AssignmentCard name="Interest Form" due="Jan 12, 2026" status="submitted" onAction={() => {}} />
        <AssignmentCard name="TSR 2" due="Jan 25, 2026" project="GrepThink 2.0" status="closed" onAction={() => {}} />
      </div>
    </div>
  );
}

/* ── TSR (student) ──────────────────────────────────────────── */
function TsrScreen() {
  const [entries, setEntries] = React.useState([
    { name: 'Tony Wu', role: 'Scrum Master', percent: 25, positive: '', constructive: '' },
    { name: 'Landon Ngo', role: 'Member', percent: 25, positive: '', constructive: '' },
    { name: 'Joshua Cruz', role: 'Member', percent: 25, positive: '', constructive: '' },
    { name: 'Ashton Liu', role: 'Product Owner', percent: 25, positive: '', constructive: '' },
  ]);
  const [notes, setNotes] = React.useState('');
  return (
    <Card title="TSR 3 — Sprint 3" subtitle="Due Feb 01, 2026 · 11:59 PM"
      footer={<React.Fragment><Button variant="secondary">Save draft</Button><Button>Submit TSR</Button></React.Fragment>}>
      <TSRForm entries={entries} onChange={setEntries} showScrumNotes scrumNotes={notes} onScrumNotesChange={setNotes} />
    </Card>
  );
}

/* ── Messages ───────────────────────────────────────────────── */
function MessagesScreen() {
  const [active, setActive] = React.useState('Team 1');
  const [draft, setDraft] = React.useState('');
  const [msgs, setMsgs] = React.useState([
    { own: false, author: 'Tony Wu', time: '3:42 PM', text: 'standup at 4?' },
    { own: true, time: '3:43 PM', text: 'works for me' },
    { own: false, author: 'Landon Ngo', time: '3:45 PM', text: 'pushed the roster fix, can demo' },
  ]);
  const send = (text) => { setMsgs([...msgs, { own: true, time: 'now', text }]); setDraft(''); };
  return (
    <div className="gtk-messages">
      <Card padded={false} shadow="hairline" className="gtk-messages__list">
        <ConversationListItem name="Team 1" preview="pushed the roster fix, can demo" time="2m" unread={0} online active={active==='Team 1'} onClick={() => setActive('Team 1')} />
        <ConversationListItem name="Sam the TA" preview="Zoom link for tomorrow ↓" time="1h" unread={2} active={active==='Sam the TA'} onClick={() => setActive('Sam the TA')} />
        <ConversationListItem name="Joshua Cruz" preview="thanks!" time="Mon" unread={1} active={active==='Joshua Cruz'} onClick={() => setActive('Joshua Cruz')} />
      </Card>
      <Card padded={false} shadow="hairline" className="gtk-messages__thread">
        <div className="gtk-messages__head">{active}</div>
        <div className="gtk-messages__scroll">
          {msgs.map((m, i) => (
            <MessageBubble key={i} own={m.own} author={m.author} time={m.time}>{m.text}</MessageBubble>
          ))}
        </div>
        <MessageComposer value={draft} onChange={setDraft} onSend={send} />
      </Card>
    </div>
  );
}

/* ── Roster (instructor/TA) ─────────────────────────────────── */
function RosterScreen() {
  const [page, setPage] = React.useState(1);
  const [tab, setTab] = React.useState('all');
  const More = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>;
  return (
    <div className="gtk-stack">
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'all', label: 'All students', count: 62 },
        { value: 'unteamed', label: 'Unteamed', count: 7 },
        { value: 'invited', label: 'Invited', count: 4 },
      ]} />
      <Card padded={false} shadow="hairline">
        <RosterRow name="Ashton Liu" email="aliu@ucsc.edu" role="product_owner" team="Team 1" status="Enrolled" statusTone="success" actions={<IconButton ariaLabel="More" size="sm">{More}</IconButton>} />
        <RosterRow name="Tony Wu" email="twu@ucsc.edu" role="scrum_master" team="Team 1" status="Enrolled" statusTone="success" actions={<IconButton ariaLabel="More" size="sm">{More}</IconButton>} />
        <RosterRow name="Priya Raman" email="praman@ucsc.edu" role="member" team="Team 4" status="Enrolled" statusTone="success" actions={<IconButton ariaLabel="More" size="sm">{More}</IconButton>} />
        <RosterRow name="Marcus Lee" email="mlee@ucsc.edu" role="member" team="—" status="Invited" statusTone="info" actions={<IconButton ariaLabel="More" size="sm">{More}</IconButton>} />
      </Card>
      <div className="gtk-center"><Pagination page={page} pageCount={16} onChange={setPage} /></div>
    </div>
  );
}

/* ── Meetings (TA) ──────────────────────────────────────────── */
function MeetingsScreen() {
  return (
    <div className="gtk-stack">
      <div className="gtk-grid2">
        <MeetingCard team="Team 1 — weekly sync" time="Tue Jan 20 · 3:00 PM" zoomUrl="#" attendees={['Ashton Liu','Tony Wu','Landon Ngo','Joshua Cruz']} attendance={{present:0,total:4}} status="upcoming" onMarkAttendance={() => {}} />
        <MeetingCard team="Team 4 — weekly sync" time="Tue Jan 20 · 4:00 PM" zoomUrl="#" attendees={['Priya Raman','Marcus Lee','Dana Ko']} attendance={{present:0,total:3}} status="upcoming" onMarkAttendance={() => {}} />
        <MeetingCard team="Team 2 — weekly sync" time="Mon Jan 19 · 2:00 PM" attendees={['Sofia Reyes','Ben Zhou','Ada Osei','Kim Tran']} attendance={{present:4,total:4}} status="completed" />
        <MeetingCard team="Team 3 — weekly sync" time="Mon Jan 19 · 3:00 PM" attendees={['Noah Park','Ella Kim']} attendance={{present:1,total:4}} status="missed" />
      </div>
      <Card title="Latest TSR summaries" shadow="hairline">
        <div className="gtk-grid2">
          <TSRSummaryCard submitter="Ashton Liu" sprint="Sprint 3" submittedAt="Jan 17" rows={[{name:'Tony Wu',percent:25},{name:'Landon Ngo',percent:30},{name:'Joshua Cruz',percent:20},{name:'Ashton Liu',percent:25}]} onOpen={() => {}} />
          <TSRSummaryCard submitter="Priya Raman" sprint="Sprint 3" status="late" submittedAt="Jan 19" rows={[{name:'Marcus Lee',percent:35},{name:'Dana Ko',percent:30},{name:'Priya Raman',percent:35}]} onOpen={() => {}} />
        </div>
      </Card>
    </div>
  );
}

/* ── Placeholder for settings/help ──────────────────────────── */
function StubScreen({ title }) {
  return (
    <Card shadow="hairline">
      <EmptyState compact title={title} description="Not recreated in this kit — see the codebase for the real view." />
    </Card>
  );
}

window.GTKScreens = { HomeScreen, ProjectsScreen, AssignmentsScreen, TsrScreen, MessagesScreen, RosterScreen, MeetingsScreen, StubScreen };

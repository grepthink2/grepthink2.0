import { Input } from '@components/Input/Input';
import { Table, type TableColumn } from '@components/Table/Table';
import { Textarea } from '@components/Textarea/Textarea';
import type {
  ApiDocumentStoryLine,
  ApiProjectDocument,
  ApiSprintAction,
  ApiSprintReportAfterSprint,
  ApiSprintReportBody,
  ApiSprintReportLateTask,
} from '@/lib/api';
import BurnupChart from '@features/scrum/components/BurnupChart';
import { ACTION_MAX, ACTIONS_MAX, REASON_MAX, SATISFIED_NOTE_MAX } from '../config/limits';
import { formatDay } from '../utils/dates';
import { ACTION_LISTS, newAction, type ActionListKey } from '../utils/documentBody';
import EditableList from './EditableList';
import FromBoard from './FromBoard';
import '@features/scrum/scrum.scss';

interface SprintReportEditorProps {
  doc: ApiProjectDocument<'sprint_report'>;
  body: ApiSprintReportBody;
  editable: boolean;
  onChange: (body: ApiSprintReportBody) => void;
}

/** "Pair on reviews" in quotes, or the place in its list while it has no words. */
const actionName = (item: ApiSprintAction, index: number, list: string) =>
  (item.action.trim() ? `“${item.action.trim()}”` : `${list} ${index + 1}`);

interface ActionFieldsProps {
  item: ApiSprintAction;
  index: number;
  list: string;
  editable: boolean;
  onChange: (item: ApiSprintAction) => void;
}

/** One action: what the team will do and why, or the two as text. */
function ActionFields({ item, index, list, editable, onChange }: ActionFieldsProps) {
  if (!editable) {
    return (
      <p className="document-action">
        <strong>{item.action}</strong>
        {item.reason && <>{' '}<span className="document-action__reason">{item.reason}</span></>}
      </p>
    );
  }
  // The hidden words make each field's name its own: "Action 2, Stop doing".
  const where = <>{' '}<span className="gt-visually-hidden">{`${index + 1}, ${list}`}</span></>;
  return (
    <div className="document-action document-action--editing">
      <Input
        label={<>Action{where}</>}
        value={item.action}
        maxLength={ACTION_MAX}
        onChange={(e) => onChange({ ...item, action: e.target.value })}
      />
      <Textarea
        label={<>Reason{where}</>}
        optional
        rows={2}
        value={item.reason}
        maxLength={REASON_MAX}
        onChange={(e) => onChange({ ...item, reason: e.target.value })}
      />
    </div>
  );
}

/** One story of the sprint: key, title, points and hours. */
function StoryLine({ story }: { story: ApiDocumentStoryLine }) {
  const details = [
    story.points != null ? `${story.points} ${story.points === 1 ? 'point' : 'points'}` : null,
    story.hours != null ? `${story.hours} h` : null,
  ].filter(Boolean).join(' · ');
  return (
    <li className="document-story-line">
      <span className="document-story-line__key">{story.key}</span>{' '}
      <span className="document-story-line__title">{story.title}</span>
      {details && <>{' '}<span className="document-story-line__details">{details}</span></>}
    </li>
  );
}

function StoryLines({ stories, empty }: { stories: ApiDocumentStoryLine[]; empty: string }) {
  if (stories.length === 0) return <p className="document-section__empty">{empty}</p>;
  return <ul className="document-story-lines">{stories.map((s) => <StoryLine key={s.id} story={s} />)}</ul>;
}

/** A task finished after the sprint ended: the day, its story's key, its title and its hours. */
function LateTask({ task }: { task: ApiSprintReportLateTask }) {
  return (
    <li className="document-story-line">
      <span className="document-story-line__day">{formatDay(task.done_on)}</span>{' '}
      <span className="document-story-line__key">{task.story_key}</span>{' '}
      <span className="document-story-line__title">{task.title}</span>
      {task.hours != null && <>{' '}<span className="document-story-line__details">{`${task.hours} h`}</span></>}
    </li>
  );
}

/**
 * What the team finished after the sprint ended, read only and apart from its numbers: the stories it
 * ended with unfinished that are completed now, the tasks finished since with their day, and those
 * tasks' hours. Nothing at all when there is none.
 */
function AfterSprint({ after }: { after: ApiSprintReportAfterSprint | null }) {
  if (!after || (after.stories.length === 0 && after.tasks.length === 0)) return null;
  return (
    <section className="document-section" aria-labelledby="document-after-sprint">
      <h2 className="document-section__title" id="document-after-sprint">After the sprint ended</h2>
      <p className="document-section__hint">
        Work finished after the sprint’s last day. It is not counted in this sprint’s numbers or rates.
      </p>
      <h3 className="document-section__subtitle">Stories completed since</h3>
      <StoryLines stories={after.stories} empty="No story was completed since." />
      <h3 className="document-section__subtitle">Tasks finished since</h3>
      {after.tasks.length === 0
        ? <p className="document-section__empty">No task was finished since.</p>
        : <ul className="document-story-lines">{after.tasks.map((t) => <LateTask key={t.id} task={t} />)}</ul>}
      <p className="document-section__text">{`Hours in those tasks: ${after.hours}`}</p>
    </section>
  );
}

interface RateRow {
  id: string;
  measure: string;
  sprint: string;
  toDate: string;
}

const RATE_COLUMNS: TableColumn<RateRow>[] = [
  { key: 'measure', label: 'Measure', rowHeader: true },
  { key: 'sprint', label: 'This sprint', className: 'document-rates__number' },
  { key: 'toDate', label: 'To date', className: 'document-rates__number' },
];

const rate = (n: number) => n.toFixed(2);

/**
 * The sprint report's editor: the actions to stop, start and keep doing (each with its reason, at most
 * ten a list, with the note for a team that has nothing to stop), then what the board says about the
 * sprint as it ended: its stories, completed or not, what was finished after it ended, its numbers and
 * rates beside the averages to date, and its burnup.
 */
export default function SprintReportEditor({ doc, body, editable, onChange }: SprintReportEditorProps) {
  const derived = doc.derived;
  const setList = (key: ActionListKey, items: ApiSprintAction[]) => onChange({ ...body, [key]: items });
  const asOf = derived.as_of === 'now'
    ? 'Shown as the board is now: this sprint has no saved end-of-sprint record.'
    : `As the sprint stood on ${formatDay(derived.as_of)}.`;
  const sprints = derived.to_date.sprints_counted;
  const rates: RateRow[] = [
    { id: 'stories', measure: 'User stories completed', sprint: String(derived.stories_completed), toDate: '' },
    { id: 'hours', measure: 'Hours in completed stories', sprint: String(derived.hours_completed), toDate: '' },
    { id: 'days', measure: 'Days in the sprint', sprint: String(derived.days), toDate: '' },
    { id: 'stories-rate', measure: 'User stories per day', sprint: rate(derived.stories_per_day), toDate: rate(derived.to_date.stories_per_day) },
    { id: 'hours-rate', measure: 'Ideal work hours per day', sprint: rate(derived.hours_per_day), toDate: rate(derived.to_date.hours_per_day) },
  ];
  const sprintName = doc.document.sprint?.name ?? 'Sprint';

  return (
    <div className="document-editor">
      <div className="document-actions">
      {ACTION_LISTS.map(({ key, label }) => (
        <section key={key} className="document-section" aria-labelledby={`document-${key}`}>
          <h2 className="document-section__title" id={`document-${key}`}>{label}</h2>
          <EditableList
            label={label}
            items={body[key]}
            itemKey={(item) => item.id}
            itemName={(item, i) => actionName(item, i, label)}
            editable={editable}
            onChange={(items) => setList(key, items)}
            max={ACTIONS_MAX}
            newItem={newAction}
            addLabel="Add an action"
            emptyText={editable ? 'No actions yet.' : 'None.'}
            limitText={`${ACTIONS_MAX} of ${ACTIONS_MAX}: a list holds no more`}
            renderItem={(item, i) => (
              <ActionFields
                item={item}
                index={i}
                list={label}
                editable={editable}
                onChange={(next) => setList(key, body[key].map((a) => (a.id === next.id ? next : a)))}
              />
            )}
          />
          {key === 'stop' && (editable ? (
            <Textarea
              className="document-section__note"
              label="Nothing to stop doing? Say why"
              optional
              rows={2}
              value={body.satisfied_note}
              maxLength={SATISFIED_NOTE_MAX}
              onChange={(e) => onChange({ ...body, satisfied_note: e.target.value })}
            />
          ) : body.satisfied_note ? (
            <p className="document-section__text">{body.satisfied_note}</p>
          ) : null)}
        </section>
      ))}
      </div>

      <FromBoard frozen={doc.derived_frozen} note={asOf}>
        <section className="document-section" aria-labelledby="document-work">
          <h2 className="document-section__title" id="document-work">Work completed</h2>
          <h3 className="document-section__subtitle">Completed</h3>
          <StoryLines stories={derived.completed} empty="No story was completed." />
          <h3 className="document-section__subtitle">Not completed</h3>
          <StoryLines stories={derived.not_completed} empty="Every story was completed." />
        </section>
        <AfterSprint after={derived.after_sprint} />
        <section className="document-section" aria-labelledby="document-rates">
          <h2 className="document-section__title" id="document-rates">Work completion rate</h2>
          <Table
            className="document-rates"
            caption={`Work completion rate: this sprint, and to date over ${sprints} ${sprints === 1 ? 'sprint' : 'sprints'}`}
            columns={RATE_COLUMNS}
            rows={rates}
            dense
          />
          <p className="document-section__hint">
            To date counts this sprint and every one before it ({sprints} {sprints === 1 ? 'sprint' : 'sprints'}).
          </p>
          <p className="document-section__hint">
            The burnup counts every finished task, so its last point can be higher.
          </p>
        </section>
        <section className="document-section" aria-label={`${sprintName} burnup`}>
          <BurnupChart
            labels={derived.burnup.labels}
            scope={derived.burnup.scope}
            completed={derived.burnup.completed}
            unit={derived.burnup.unit}
            title={`${sprintName} burnup`}
          />
        </section>
      </FromBoard>
    </div>
  );
}

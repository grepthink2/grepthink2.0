import { useId, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Input } from '@components/Input/Input';
import { Select } from '@components/Select/Select';
import { Table, type TableColumn } from '@components/Table/Table';
import { Tag } from '@components/Tag/Tag';
import { Textarea } from '@components/Textarea/Textarea';
import type {
  ApiDocumentStory,
  ApiFollowUp,
  ApiKnownProblem,
  ApiKnownProblemKind,
  ApiProjectDocument,
  ApiReleaseSummaryBody,
  ApiReleaseSummaryDerived,
} from '@/lib/api';
import { FOLLOW_UP_MAX, FOLLOW_UPS_MAX, KEY_STORIES_MAX, KNOWN_PROBLEMS_MAX, PROBLEM_MAX } from '../config/limits';
import type { ProjectStories } from '../hooks/useProjectStories';
import { newFollowUp, newKnownProblem, PROBLEM_KIND_LABELS } from '../utils/documentBody';
import { storyBoardPath } from '../utils/documentLinks';
import { STORY_GONE, storyLabel, type StoryRef } from '../utils/storyRefs';
import EditableList from './EditableList';
import FromBoard from './FromBoard';
import StoryPicker from './StoryPicker';

interface ReleaseSummaryEditorProps {
  doc: ApiProjectDocument<'release_summary'>;
  body: ApiReleaseSummaryBody;
  editable: boolean;
  onChange: (body: ApiReleaseSummaryBody) => void;
  /** The stories the body names, as the page can tell them. */
  story: (id: string) => StoryRef;
  /** The board's stories, for the picker and the links to the board. */
  board: ProjectStories;
}

const KIND_OPTIONS = (Object.keys(PROBLEM_KIND_LABELS) as ApiKnownProblemKind[])
  .map((value) => ({ value, label: PROBLEM_KIND_LABELS[value] }));

interface KeyStoryProps {
  story: StoryRef;
  editable: boolean;
  projectId: string;
  /** The story as the board's stories answered for it, which says where it sits on the board. */
  boardStory: ApiDocumentStory | undefined;
}

/** A key story with its criteria, and for an editor a link to edit it on the board. */
function KeyStory({ story, editable, projectId, boardStory }: KeyStoryProps) {
  if (story.state === 'missing') return <p className="document-key-story document-key-story--gone">{STORY_GONE}</p>;
  if (story.state === 'unknown') return <p className="document-key-story">A story the board has not answered for yet.</p>;
  return (
    <div className="document-key-story">
      <p className="document-key-story__head">
        <span className="document-key-story__key">{story.key}</span>{' '}
        <span className="document-key-story__title">{story.title}</span>
        {story.completed === false && <>{' '}<span className="document-key-story__state">Not completed</span></>}
      </p>
      {story.acceptance_criteria.length > 0 ? (
        <ol className="document-key-story__criteria" aria-label={`Acceptance criteria of ${story.key}`}>
          {story.acceptance_criteria.map((c, i) => <li key={i}>{c}</li>)}
        </ol>
      ) : (
        <p className="document-key-story__none">No acceptance criteria yet: add them on the board.</p>
      )}
      {editable && (
        <Link className="document-key-story__edit" to={storyBoardPath(projectId, story.id, boardStory ? boardStory.sprint_id : undefined)}>
          Edit on the board <ArrowRight size={12} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

interface ProblemFieldsProps {
  item: ApiKnownProblem;
  index: number;
  editable: boolean;
  onChange: (item: ApiKnownProblem) => void;
}

function ProblemFields({ item, index, editable, onChange }: ProblemFieldsProps) {
  if (!editable) {
    return (
      <p className="document-problem">
        <Tag>{PROBLEM_KIND_LABELS[item.kind]}</Tag>{' '}
        <span>{item.text}</span>
      </p>
    );
  }
  const where = <>{' '}<span className="gt-visually-hidden">{`of known problem ${index + 1}`}</span></>;
  return (
    <div className="document-problem document-problem--editing">
      <Select
        className="document-problem__kind"
        label={<>Kind{where}</>}
        compact
        options={KIND_OPTIONS}
        value={item.kind}
        onChange={(e) => onChange({ ...item, kind: e.target.value as ApiKnownProblemKind })}
      />
      <Textarea
        className="document-problem__text"
        label={<>Problem{where}</>}
        rows={2}
        value={item.text}
        maxLength={PROBLEM_MAX}
        onChange={(e) => onChange({ ...item, text: e.target.value })}
      />
    </div>
  );
}

interface BacklogRow {
  id: string;
  key: string;
  title: string;
  points: string;
  where: string;
}

const BACKLOG_COLUMNS: TableColumn<BacklogRow>[] = [
  { key: 'key', label: 'Story', rowHeader: true, width: '6rem' },
  { key: 'title', label: 'Title' },
  { key: 'points', label: 'Points', className: 'document-rates__number', width: '5rem' },
  { key: 'where', label: 'Where', width: '8rem' },
];

/**
 * The release summary's editor: the key stories in the team's order, each with its acceptance criteria
 * and a link to edit it on the board, and a picker to add more; the known problems, each a bug, an
 * omission or a design shortcut; the product backlog the board holds; and the follow-ups.
 */
export default function ReleaseSummaryEditor({ doc, body, editable, onChange, story, board }: ReleaseSummaryEditorProps) {
  const derived: ApiReleaseSummaryDerived = doc.derived;
  const projectId = doc.document.project_id;
  const keyHintId = useId();
  const picked = useMemo(() => new Set(body.key_story_ids), [body.key_story_ids]);
  const candidates = useMemo(() => board.stories.filter((s) => !picked.has(s.id)), [board.stories, picked]);
  const backlog: BacklogRow[] = derived.backlog.map((s) => ({
    id: s.id, key: s.key, title: s.title, points: s.points != null ? String(s.points) : '', where: s.in_sprint ?? 'Backlog',
  }));
  const atLimit = body.key_story_ids.length >= KEY_STORIES_MAX;

  return (
    <div className="document-editor">
      <section className="document-section" aria-labelledby="document-key-stories">
        <h2 className="document-section__title" id="document-key-stories">Key user stories and acceptance criteria</h2>
        <EditableList
          label="Key stories"
          items={body.key_story_ids}
          itemKey={(id) => id}
          itemName={(id) => {
            const ref = story(id);
            return ref.state === 'known' ? ref.key : storyLabel(ref);
          }}
          editable={editable}
          onChange={(ids) => onChange({ ...body, key_story_ids: ids })}
          max={KEY_STORIES_MAX}
          emptyText={editable ? 'No key story yet: add one from the board.' : 'None.'}
          limitText={`${KEY_STORIES_MAX} of ${KEY_STORIES_MAX}: the summary holds no more`}
          addControl={(
            <StoryPicker
              label="Add a key story"
              stories={candidates}
              status={board.status}
              onRetry={board.retry}
              disabled={atLimit}
              describedBy={atLimit ? keyHintId : undefined}
              onPick={(s) => onChange({ ...body, key_story_ids: [...body.key_story_ids, s.id] })}
            />
          )}
          renderItem={(id) => (
            <KeyStory story={story(id)} editable={editable} projectId={projectId} boardStory={board.byId.get(id)} />
          )}
        />
        {atLimit && <span className="gt-visually-hidden" id={keyHintId}>The summary holds at most {KEY_STORIES_MAX} key stories.</span>}
      </section>

      <section className="document-section" aria-labelledby="document-problems">
        <h2 className="document-section__title" id="document-problems">Known problems</h2>
        <p className="document-section__hint">Bugs, omissions and design shortcuts the release still has.</p>
        <EditableList
          label="Known problems"
          items={body.known_problems}
          itemKey={(item) => item.id}
          itemName={(_, i) => `known problem ${i + 1}`}
          editable={editable}
          onChange={(items) => onChange({ ...body, known_problems: items })}
          max={KNOWN_PROBLEMS_MAX}
          newItem={() => newKnownProblem()}
          addLabel="Add a known problem"
          emptyText={editable ? 'No known problems yet.' : 'None.'}
          renderItem={(item, i) => (
            <ProblemFields
              item={item}
              index={i}
              editable={editable}
              onChange={(next) => onChange({ ...body, known_problems: body.known_problems.map((p) => (p.id === next.id ? next : p)) })}
            />
          )}
        />
      </section>

      <FromBoard frozen={doc.derived_frozen}>
        <section className="document-section" aria-labelledby="document-backlog">
          <h2 className="document-section__title" id="document-backlog">Product backlog</h2>
          <p className="document-section__hint">The stories not completed, sprint by sprint, then the backlog’s.</p>
          <Table
            caption="Product backlog"
            columns={BACKLOG_COLUMNS}
            rows={backlog}
            dense
            emptyText="The backlog is empty: every story is completed."
          />
        </section>
      </FromBoard>

      <section className="document-section" aria-labelledby="document-follow-ups">
        <h2 className="document-section__title" id="document-follow-ups">Follow-ups</h2>
        <p className="document-section__hint">Bug fixes and ideas that are not stories on the board.</p>
        <EditableList
          label="Follow-ups"
          items={body.follow_ups}
          itemKey={(item) => item.id}
          itemName={(_, i) => `follow-up ${i + 1}`}
          editable={editable}
          onChange={(items) => onChange({ ...body, follow_ups: items })}
          max={FOLLOW_UPS_MAX}
          newItem={newFollowUp}
          addLabel="Add a follow-up"
          emptyText={editable ? 'No follow-ups yet.' : 'None.'}
          renderItem={(item: ApiFollowUp, i) => (editable ? (
            <Input
              label={<>Follow-up{' '}<span className="gt-visually-hidden">{`${i + 1}`}</span></>}
              hideLabel
              value={item.text}
              maxLength={FOLLOW_UP_MAX}
              onChange={(e) => onChange({
                ...body,
                follow_ups: body.follow_ups.map((f) => (f.id === item.id ? { ...f, text: e.target.value } : f)),
              })}
            />
          ) : <p className="document-section__text">{item.text}</p>)}
        />
      </section>
    </div>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Eye, PencilLine } from 'lucide-react';
import { Button } from '@components/Button/Button';
import { Checkbox } from '@components/Checkbox/Checkbox';
import { Input } from '@components/Input/Input';
import MarkdownText from '@components/Markdown/MarkdownText';
import { SegmentedControl, type SegmentedOption } from '@components/SegmentedControl/SegmentedControl';
import { Tag } from '@components/Tag/Tag';
import { Textarea } from '@components/Textarea/Textarea';
import type { ApiProjectDocument, ApiTestReportBody, ApiTestScenario, ApiUnitTestEntry } from '@/lib/api';
import {
  LOCATION_MAX,
  NOTE_MAX,
  SCENARIO_STORIES_MAX,
  SCENARIO_TITLE_MAX,
  SCENARIOS_MAX,
  STEPS_MAX,
  UNIT_TESTS_MAX,
  UNIT_TESTS_NOTE_MAX,
} from '../config/limits';
import type { ProjectStories } from '../hooks/useProjectStories';
import { newScenario, newUnitTest, scenarioFor } from '../utils/documentBody';
import { STORY_GONE, storyLabel, type StoryRef } from '../utils/storyRefs';
import EditableList from './EditableList';
import FromBoard from './FromBoard';
import StoryPicker from './StoryPicker';

interface TestReportEditorProps {
  doc: ApiProjectDocument<'test_report'>;
  body: ApiTestReportBody;
  editable: boolean;
  onChange: (body: ApiTestReportBody) => void;
  story: (id: string) => StoryRef;
  board: ProjectStories;
}

type Result = 'pass' | 'fail' | 'not_run';

const RESULT_OPTIONS: SegmentedOption<Result>[] = [
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'not_run', label: 'Not run' },
];
const RESULT_WORDS: Record<Result, string> = { pass: 'Passed', fail: 'Failed', not_run: 'Not run' };

const scenarioName = (scenario: ApiTestScenario, index: number) =>
  (scenario.title.trim() ? `scenario “${scenario.title.trim()}”` : `scenario ${index + 1}`);

interface ScenarioCardProps {
  scenario: ApiTestScenario;
  index: number;
  editable: boolean;
  /** The stories' criteria are as handed in. */
  frozen: boolean;
  onChange: (scenario: ApiTestScenario) => void;
  story: (id: string) => StoryRef;
  board: ProjectStories;
}

/** One system test scenario: its title, the stories it covers with their criteria, its steps, result and note. */
function ScenarioCard({ scenario, index, editable, frozen, onChange, story, board }: ScenarioCardProps) {
  const [preview, setPreview] = useState(false);
  const hintId = useId();
  const n = index + 1;
  const refs = scenario.story_ids.map(story);
  const result: Result = scenario.result ?? 'not_run';
  const candidates = board.stories.filter((s) => !scenario.story_ids.includes(s.id));
  const full = scenario.story_ids.length >= SCENARIO_STORIES_MAX;
  const where = <>{' '}<span className="gt-visually-hidden">{`of scenario ${n}`}</span></>;
  const criteria = refs.filter((r) => r.state !== 'unknown');

  return (
    <article className="document-scenario" aria-label={`Scenario ${n}`}>
      {editable ? (
        <Input
          label={<>Title{where}</>}
          value={scenario.title}
          maxLength={SCENARIO_TITLE_MAX}
          onChange={(e) => onChange({ ...scenario, title: e.target.value })}
        />
      ) : (
        <h3 className="document-scenario__title">
          <span className="document-scenario__number">Scenario {n}</span> {scenario.title}
        </h3>
      )}

      <div className="document-scenario__stories" role="group" aria-label={`Stories scenario ${n} covers`}>
        <span className="document-scenario__label" aria-hidden="true">Stories</span>
        {refs.length === 0 && <span className="document-scenario__none">No story yet.</span>}
        {refs.map((ref) => (
          <Tag
            key={ref.id}
            tone={ref.state === 'missing' ? 'neutral' : 'green'}
            onRemove={editable ? () => onChange({ ...scenario, story_ids: scenario.story_ids.filter((id) => id !== ref.id) }) : undefined}
            removeLabel={`Remove ${ref.state === 'known' ? ref.key : ref.state === 'missing' ? 'the deleted story' : 'this story'} from scenario ${n}`}
          >
            {ref.state === 'known' ? ref.key : storyLabel(ref)}
          </Tag>
        ))}
        {editable && (
          <StoryPicker
            label="Add a story"
            stories={candidates}
            status={board.status}
            onRetry={board.retry}
            disabled={full}
            describedBy={full ? hintId : undefined}
            onPick={(s) => onChange({ ...scenario, story_ids: [...scenario.story_ids, s.id] })}
          />
        )}
        {editable && full && <span className="document-scenario__hint" id={hintId}>A scenario covers at most {SCENARIO_STORIES_MAX} stories.</span>}
      </div>

      {criteria.length > 0 && (
        <FromBoard frozen={frozen} className="document-scenario__board">
          <ul className="document-scenario__criteria">
            {criteria.map((ref) => (
              <li key={ref.id}>
                {ref.state === 'known' ? (
                  <>
                    <span className="document-key-story__key">{ref.key}</span> {ref.title}
                    {ref.acceptance_criteria.length > 0 ? (
                      <ol aria-label={`Acceptance criteria of ${ref.key}`}>
                        {ref.acceptance_criteria.map((c, i) => <li key={i}>{c}</li>)}
                      </ol>
                    ) : (
                      <p className="document-key-story__none">No acceptance criteria.</p>
                    )}
                  </>
                ) : STORY_GONE}
              </li>
            ))}
          </ul>
        </FromBoard>
      )}

      {editable ? (
        <div className="document-scenario__steps">
          <div className="document-scenario__steps-head">
            <span className="document-scenario__label">Steps</span>
            <Button
              variant="ghost"
              size="sm"
              pressed={preview}
              iconLeft={preview ? <PencilLine size={14} /> : <Eye size={14} />}
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? 'Edit the steps' : 'Preview the steps'}
            </Button>
          </div>
          {preview ? (
            <div className="document-scenario__preview" aria-label={`Steps of scenario ${n}, as they will read`} role="region">
              {scenario.steps_md.trim()
                ? <MarkdownText>{scenario.steps_md}</MarkdownText>
                : <p className="document-scenario__none">No steps yet.</p>}
            </div>
          ) : (
            <Textarea
              label={<>Steps{' '}<span className="gt-visually-hidden">{`of scenario ${n}, in Markdown`}</span></>}
              hideLabel
              rows={5}
              value={scenario.steps_md}
              maxLength={STEPS_MAX}
              helperText="Markdown: 1. a numbered step per line"
              onChange={(e) => onChange({ ...scenario, steps_md: e.target.value })}
            />
          )}
        </div>
      ) : scenario.steps_md.trim() ? (
        <div className="document-scenario__steps"><MarkdownText>{scenario.steps_md}</MarkdownText></div>
      ) : null}

      {editable ? (
        <div className="document-scenario__result">
          <span className="document-scenario__label" aria-hidden="true">Result</span>
          <SegmentedControl
            options={RESULT_OPTIONS}
            value={result}
            onChange={(next) => onChange({ ...scenario, result: next === 'not_run' ? null : next })}
            ariaLabel={`Result of scenario ${n}`}
            size="sm"
          />
        </div>
      ) : (
        <p className="document-scenario__result-text">Result: <strong>{RESULT_WORDS[result]}</strong></p>
      )}

      {editable ? (
        <Input
          label={<>Note{where}</>}
          optional
          value={scenario.note}
          maxLength={NOTE_MAX}
          onChange={(e) => onChange({ ...scenario, note: e.target.value })}
        />
      ) : scenario.note ? (
        <p className="document-section__text">Note: {scenario.note}</p>
      ) : null}
    </article>
  );
}

interface UnitTestFieldsProps {
  item: ApiUnitTestEntry;
  index: number;
  editable: boolean;
  suggestionsId: string;
  onChange: (item: ApiUnitTestEntry) => void;
}

function UnitTestFields({ item, index, editable, suggestionsId, onChange }: UnitTestFieldsProps) {
  if (!editable) {
    return (
      <p className="document-unit-test">
        <code>{item.location}</code>{' '}
        <span className="document-unit-test__state">{item.failing ? 'Some fail' : 'All pass'}</span>
        {item.note && <>{' '}<span>{item.note}</span></>}
      </p>
    );
  }
  const where = <>{' '}<span className="gt-visually-hidden">{`of unit tests ${index + 1}`}</span></>;
  return (
    <div className="document-unit-test document-unit-test--editing">
      <Input
        label={<>Location{where}</>}
        helperText="A path in the repository, or a link"
        list={suggestionsId}
        value={item.location}
        maxLength={LOCATION_MAX}
        onChange={(e) => onChange({ ...item, location: e.target.value })}
      />
      <Input
        label={<>Note{where}</>}
        optional
        value={item.note}
        maxLength={NOTE_MAX}
        onChange={(e) => onChange({ ...item, note: e.target.value })}
      />
      <Checkbox
        label="Some of these tests fail"
        checked={item.failing}
        onChange={(e) => onChange({ ...item, failing: e.target.checked })}
      />
    </div>
  );
}

/**
 * The test plan and report's editor: the system test scenarios (each with the stories it covers and
 * their criteria from the board, its steps in Markdown with a preview, its result and a note), the
 * stories with criteria that no scenario covers yet, each with a button that adds a scenario for it
 * (its steps are the story's criteria, so it waits for the board's stories), and the unit tests, with
 * the team's repositories offered for a location.
 */
export default function TestReportEditor({ doc, body, editable, onChange, story, board }: TestReportEditorProps) {
  const suggestionsId = useId();
  const uncoveredId = useId();
  const waitId = useId();
  const editorRef = useRef<HTMLDivElement>(null);
  /** A scenario added from the uncovered list, whose title takes focus once it is drawn. */
  const focusScenario = useRef<string | null>(null);
  const derived = doc.derived;

  useEffect(() => {
    const id = focusScenario.current;
    if (!id) return;
    focusScenario.current = null;
    const row = [...(editorRef.current?.querySelectorAll<HTMLElement>('[data-item-key]') ?? [])].find((el) => el.dataset.itemKey === id);
    row?.querySelector<HTMLElement>('input')?.focus();
  });

  // The saved scenarios decided `uncovered`; a story an unsaved scenario names is covered already.
  const uncovered = useMemo(() => {
    const covered = new Set(body.scenarios.flatMap((s) => s.story_ids));
    return derived.uncovered.filter((s) => !covered.has(s.id));
  }, [derived.uncovered, body.scenarios]);
  const scenariosFull = body.scenarios.length >= SCENARIOS_MAX;
  // A scenario added for a story takes its criteria as steps: the board's stories must be read first.
  const criteriaRead = board.status === 'ready';

  const setScenario = (next: ApiTestScenario) =>
    onChange({ ...body, scenarios: body.scenarios.map((s) => (s.id === next.id ? next : s)) });
  const addScenarioFor = (target: { id: string; key: string; title: string }) => {
    if (scenariosFull) return;
    const criteria = board.byId.get(target.id)?.acceptance_criteria ?? [];
    const scenario = scenarioFor({ ...target, acceptance_criteria: criteria });
    focusScenario.current = scenario.id;
    onChange({ ...body, scenarios: [...body.scenarios, scenario] });
  };

  return (
    <div className="document-editor" ref={editorRef}>
      <section className="document-section" aria-labelledby="document-scenarios">
        <h2 className="document-section__title" id="document-scenarios">System test scenarios</h2>
        <EditableList
          label="Scenarios"
          items={body.scenarios}
          itemKey={(s) => s.id}
          itemName={scenarioName}
          editable={editable}
          onChange={(scenarios) => onChange({ ...body, scenarios })}
          max={SCENARIOS_MAX}
          newItem={() => newScenario()}
          addLabel="Add a scenario"
          emptyText={editable ? 'No scenario yet.' : 'None.'}
          renderItem={(scenario, i) => (
            <ScenarioCard
              scenario={scenario}
              index={i}
              editable={editable}
              frozen={doc.derived_frozen}
              onChange={setScenario}
              story={story}
              board={board}
            />
          )}
        />
        {editable && uncovered.length > 0 && (
          <div className="document-uncovered" role="group" aria-labelledby={uncoveredId}>
            <p className="document-uncovered__intro" id={uncoveredId}>
              These stories have acceptance criteria that no scenario covers:
            </p>
            {!criteriaRead && (
              <p className="document-uncovered__wait" id={waitId}>
                {board.status === 'error' ? (
                  <>
                    Couldn’t load the stories’ criteria.{' '}
                    <button type="button" className="document-uncovered__retry" onClick={board.retry}>Try again</button>
                  </>
                ) : 'Loading the stories’ criteria…'}
              </p>
            )}
            <ul className="document-uncovered__list">
              {uncovered.map((s) => (
                <li key={s.id}>
                  <span><span className="document-key-story__key">{s.key}</span> {s.title}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={scenariosFull || !criteriaRead}
                    aria-describedby={criteriaRead ? undefined : waitId}
                    onClick={() => addScenarioFor(s)}
                  >
                    Add a scenario for it<span className="gt-visually-hidden">{`: ${s.key}`}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="document-section" aria-labelledby="document-unit-tests">
        <h2 className="document-section__title" id="document-unit-tests">Unit tests</h2>
        <p className="document-section__hint">Where the team’s unit tests live, and whether any of them fail.</p>
        <EditableList
          label="Unit tests"
          items={body.unit_tests}
          itemKey={(u) => u.id}
          itemName={(u, i) => (u.location.trim() ? `unit tests at ${u.location.trim()}` : `unit tests ${i + 1}`)}
          editable={editable}
          onChange={(unitTests) => onChange({ ...body, unit_tests: unitTests })}
          max={UNIT_TESTS_MAX}
          newItem={newUnitTest}
          addLabel="Add a location"
          emptyText={editable ? 'No unit tests listed yet.' : 'None.'}
          renderItem={(item, i) => (
            <UnitTestFields
              item={item}
              index={i}
              editable={editable}
              suggestionsId={suggestionsId}
              onChange={(next) => onChange({ ...body, unit_tests: body.unit_tests.map((u) => (u.id === next.id ? next : u)) })}
            />
          )}
        />
        {editable && (
          <datalist id={suggestionsId}>
            {derived.repositories.map((url) => <option key={url} value={url} />)}
          </datalist>
        )}
        {editable ? (
          <Textarea
            className="document-section__note"
            label="Notes on the unit tests"
            optional
            rows={2}
            value={body.unit_tests_note}
            maxLength={UNIT_TESTS_NOTE_MAX}
            onChange={(e) => onChange({ ...body, unit_tests_note: e.target.value })}
          />
        ) : body.unit_tests_note ? <p className="document-section__text">{body.unit_tests_note}</p> : null}
        {derived.repositories.length > 0 && (
          <FromBoard frozen={doc.derived_frozen}>
            <h3 className="document-section__subtitle">The team’s repositories</h3>
            <ul className="document-repositories">
              {derived.repositories.map((url) => <li key={url}>{url}</li>)}
            </ul>
          </FromBoard>
        )}
      </section>
    </div>
  );
}

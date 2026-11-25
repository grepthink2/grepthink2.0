import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge } from '@components/Badge/Badge';
import { Button } from '@components/Button/Button';
import { Drawer } from '@components/Drawer/Drawer';
import { EmptyState } from '@components/EmptyState/EmptyState';
import { Select } from '@components/Select/Select';
import { Skeleton } from '@components/Skeleton/Skeleton';
import { api } from '@/lib/api';
import type { ApiDocumentBody, ApiDocumentKind, ApiDocumentRevisionEntry } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { formatWhen } from '../utils/dates';
import { diffBodies } from '../utils/diff';
import { SOURCE_BADGE } from '../utils/documentStatus';
import ChangeList from './ChangeList';
import { PersonName } from './PersonName';

interface RevisionsDrawerProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  kind: ApiDocumentKind;
  /** The pair to compare on opening (a save's "View changes"); else the newest against the one before. */
  compare: { older: number; newer: number } | null;
  /** The document's head: when it moves (a save, a finalize), the list is read again. */
  head: number;
  storyName: (id: string) => string;
}

/** A revision's body as the drawer has it: read, no longer kept (pruned), or not readable now. */
type Fetched = { body: ApiDocumentBody } | 'gone' | 'error';

/** The pair to compare: the one asked for, else the newest two the list holds. */
function defaultPair(revisions: ApiDocumentRevisionEntry[], asked: { older: number; newer: number } | null) {
  if (asked) return asked;
  if (revisions.length < 2) return null;
  return { older: revisions[1].number, newer: revisions[0].number };
}

/**
 * A document's revisions in a side sheet: each with its number, who saved it and when, its source and
 * a mark on every hand-in; then what changed between two of them, the newest and the one before by
 * default, any two by choice (each row's "Changes" picks it and the one before). A revision pruned
 * since says it is no longer kept. Esc and the scrim close it (the kit Drawer's dialog rules).
 */
export default function RevisionsDrawer({ open, onClose, documentId, kind, compare, head, storyName }: RevisionsDrawerProps) {
  const [list, setList] = useState<{ key: string; revisions: ApiDocumentRevisionEntry[] | null } | null>(null);
  const [picked, setPicked] = useState<{ older: number; newer: number } | null>(null);
  const [bodies, setBodies] = useState<Map<number, Fetched>>(() => new Map());
  const listKey = `${documentId}:${head}`;

  // Each opening starts from the pair asked for. Adjusted while rendering the change, not in an effect.
  const openedWith = open ? `${compare?.older ?? ''}:${compare?.newer ?? ''}` : null;
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  if (openedWith !== lastOpened) {
    setLastOpened(openedWith);
    if (openedWith !== null) {
      setPicked(compare);
      // A revision that could not be read is read again; a pruned one stays gone.
      setBodies((now) => new Map([...now].filter(([, fetched]) => fetched !== 'error')));
    }
  }

  // The list, read when the drawer opens, and again when the head moved since.
  const listSeq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const seq = ++listSeq.current;
    api
      .getDocumentRevisions(documentId)
      .then(({ revisions }) => {
        if (seq === listSeq.current) setList({ key: listKey, revisions });
      })
      .catch(() => {
        if (seq === listSeq.current) setList({ key: listKey, revisions: null });
      });
  }, [open, documentId, listKey]);

  const revisions = list?.key === listKey ? list.revisions : undefined;
  const pair = picked ?? (revisions ? defaultPair(revisions, null) : null);
  const [from, to] = pair ? [Math.min(pair.older, pair.newer), Math.max(pair.older, pair.newer)] : [null, null];

  // The two bodies compared, each read once.
  const requested = useRef(new Set<number>());
  useEffect(() => {
    if (!open || from === null || to === null) return;
    for (const n of [from, to]) {
      if (bodies.has(n) || requested.current.has(n)) continue;
      requested.current.add(n);
      api
        .getDocument(documentId, n)
        .then((doc) => setBodies((now) => new Map(now).set(n, { body: doc.body })))
        .catch((err: unknown) => {
          const gone = err instanceof ApiError && err.status === 404;
          // A failure may be read again on the next opening; a pruned revision never comes back.
          if (!gone) requested.current.delete(n);
          setBodies((now) => new Map(now).set(n, gone ? 'gone' : 'error'));
        });
    }
  }, [open, documentId, from, to, bodies]);

  const older = from !== null ? bodies.get(from) : undefined;
  const newer = to !== null ? bodies.get(to) : undefined;
  const changes = useMemo(
    () => (older && newer && older !== 'gone' && older !== 'error' && newer !== 'gone' && newer !== 'error'
      ? diffBodies(kind, older.body, newer.body)
      : null),
    [kind, older, newer],
  );

  const options = (revisions ?? []).map((r) => ({ value: String(r.number), label: `Revision ${r.number}` }));
  const choose = (side: 'older' | 'newer', value: string) => {
    const n = Number(value);
    const base = pair ?? { older: n, newer: n };
    setPicked({ ...base, [side]: n });
  };

  let comparison: ReactNode = null;
  if (revisions && revisions.length < 2) {
    comparison = <p className="document-revisions__note">There is only one revision so far.</p>;
  } else if (from !== null && to !== null) {
    const gone = [from, to].filter((n) => bodies.get(n) === 'gone');
    const failed = [from, to].some((n) => bodies.get(n) === 'error');
    comparison = (
      <>
        <div className="document-revisions__pickers">
          <Select label="Older" compact options={options} value={String(from)} onChange={(e) => choose('older', e.target.value)} />
          <Select label="Newer" compact options={options} value={String(to)} onChange={(e) => choose('newer', e.target.value)} />
        </div>
        <h3 className="document-revisions__subtitle">
          {from === to ? `Revision ${from}` : `Changes from revision ${from} to revision ${to}`}
        </h3>
        {gone.length > 0 ? (
          <p className="document-revisions__note">
            {gone.map((n) => `Revision ${n}`).join(' and ')} {gone.length === 1 ? 'is' : 'are'} no longer kept: only the
            latest revision and the hand-ins are kept once the sprint or the class is over.
          </p>
        ) : failed ? (
          <p className="document-revisions__note">Couldn’t read these revisions. Close the panel and try again.</p>
        ) : changes ? (
          <ChangeList changes={changes} storyName={storyName} />
        ) : (
          <div aria-busy="true"><Skeleton height={14} width="80%" /><Skeleton height={14} width="60%" /></div>
        )}
      </>
    );
  }

  return (
    <Drawer open={open} onClose={onClose} title="Revisions" subtitle="Every save is a revision. Hand-ins are marked." width={480}>
      {revisions === undefined ? (
        <div className="document-revisions__loading" aria-busy="true">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={36} radius={8} />)}
        </div>
      ) : revisions === null ? (
        <EmptyState variant="error" title="Couldn’t load the revisions." titleAs="p" />
      ) : (
        <>
          <ol className="document-revisions" aria-label="Revisions, newest first">
            {revisions.map((r, i) => (
              <li key={r.number} className="document-revisions__item">
                <span className="document-revisions__number">Revision {r.number}</span>{' '}
                <span className="document-revisions__who">
                  {r.saved_by_name ? <PersonName id={r.saved_by} name={r.saved_by_name} /> : 'Someone'} ·{' '}
                  {formatWhen(r.saved_at)}
                </span>{' '}
                <span className="document-revisions__badges">
                  <Badge size="sm" status={SOURCE_BADGE[r.source]} />
                  {r.finalized && <Badge size="sm" status="revision.handed_in" />}
                </span>
                {i < revisions.length - 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="document-revisions__compare"
                    pressed={to === r.number && from === revisions[i + 1].number}
                    onClick={() => setPicked({ older: revisions[i + 1].number, newer: r.number })}
                  >
                    Changes{' '}<span className="gt-visually-hidden">{`in revision ${r.number}`}</span>
                  </Button>
                )}
              </li>
            ))}
          </ol>
          <section className="document-revisions__comparison" aria-label="Comparison">{comparison}</section>
        </>
      )}
    </Drawer>
  );
}

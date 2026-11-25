import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@components/Alert/Alert';
import { Badge } from '@components/Badge/Badge';
import { Button } from '@components/Button/Button';
import { EmptyState } from '@components/EmptyState/EmptyState';
import { Table, type TableColumn } from '@components/Table/Table';
import { api } from '@/lib/api';
import type { ApiDocumentSlot } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import { sprintDates, STATUS_LABELS } from '@features/scrum/utils/sprints';
import { formatDate } from '../utils/dates';
import { documentPath } from '../utils/documentLinks';
import { documentState, STATE_BADGE } from '../utils/documentStatus';
import { PersonName } from './PersonName';
import '../documents.scss';

/** The API's answer when the team made the document first. */
const DOCUMENT_EXISTS = 'This document already exists';

interface DocumentsTabProps {
  projectId: string;
  /** A team member outside the read-only preview: a document not made yet has a Start button. */
  canStart: boolean;
  /** Rides in the document links' state, so the document page's breadcrumbs name the project. */
  projectName?: string;
}

/** One place on the tab, the API's slot with the key that tells it from the others. */
interface Row extends ApiDocumentSlot {
  id: string;
}

const keyOf = (slot: ApiDocumentSlot) => `${slot.kind}:${slot.sprint?.id ?? ''}`;

/**
 * The board's Documents tab: every document the team can have, in the API's order, under "Sprints"
 * (a report per sprint) and "End of term" (the release summary, the test plan and report). Each row
 * shows its state, its revision and who saved it last. A made document's row opens it from its first
 * cell; one not made yet has, for a team member, a Start button that makes it and opens it. A sprint
 * report can be started before its sprint ends: the finalize check holds it back, not the tab.
 */
export default function DocumentsTab({ projectId, canStart, projectName }: DocumentsTabProps) {
  const navigate = useNavigate();
  const [result, setResult] = useState<{ projectId: string; slots: ApiDocumentSlot[] | null } | null>(null);
  const [reloads, setReloads] = useState(0);
  const [starting, setStarting] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<{ tone: 'error' | 'info'; message: string } | null>(null);

  // Only the newest request may commit.
  const requestSeq = useRef(0);
  useEffect(() => {
    const seq = ++requestSeq.current;
    // A promise chain: react-hooks/set-state-in-effect accepts setState in its callbacks.
    api
      .getProjectDocuments(projectId)
      .then(({ documents }) => {
        if (seq === requestSeq.current) setResult({ projectId, slots: documents });
      })
      .catch(() => {
        if (seq === requestSeq.current) setResult({ projectId, slots: null });
      });
  }, [projectId, reloads]);

  const mine = result?.projectId === projectId ? result : null;
  const linkState = (title: string) => ({ projectName, documentTitle: title });

  const open = (documentId: string, title: string) =>
    navigate(documentPath(projectId, documentId), { state: linkState(title) });

  const start = async (slot: ApiDocumentSlot) => {
    setStarting(keyOf(slot));
    setRefusal(null);
    try {
      const made = await api.createDocument(projectId, slot.kind, slot.sprint?.id);
      open(made.document.id, made.document.title);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.detail === DOCUMENT_EXISTS) {
        // A teammate made it first: read the tab again and open theirs.
        const fresh = await api.getProjectDocuments(projectId).catch(() => null);
        const theirs = fresh?.documents.find((s) => keyOf(s) === keyOf(slot))?.document;
        if (theirs) {
          open(theirs.id, slot.title);
          return;
        }
        if (fresh) setResult({ projectId, slots: fresh.documents });
      }
      setRefusal(err instanceof ReadOnlyPreviewError
        ? { tone: 'info', message: err.message }
        : { tone: 'error', message: err instanceof ApiError ? err.message : 'Couldn’t start the document.' });
    } finally {
      setStarting(null);
    }
  };

  const columns: TableColumn<Row>[] = [
    {
      key: 'title',
      label: 'Document',
      rowHeader: true,
      render: (row) => (
        <span className="documents-tab__name">
          {row.document ? (
            <Link className="documents-tab__open" to={documentPath(projectId, row.document.id)} state={linkState(row.title)}>
              {row.title}
            </Link>
          ) : row.title}
          {row.sprint && (
            <span className="documents-tab__sprint">
              {sprintDates(row.sprint)} · {STATUS_LABELS[row.sprint.status]}
            </span>
          )}
        </span>
      ),
    },
    { key: 'status', label: 'Status', className: 'documents-tab__status', render: (row) => <Badge status={STATE_BADGE[documentState(row.document)]} /> },
    {
      key: 'revision',
      label: 'Revision',
      className: 'documents-tab__revision',
      render: (row) => (row.document ? `Revision ${row.document.head_revision}` : ''),
    },
    {
      key: 'saved',
      label: 'Last saved',
      className: 'documents-tab__saved',
      render: (row) => (row.document ? (
        <>
          {formatDate(row.document.updated_at)}
          {row.document.saved_by_name && (
            <>
              {' by '}
              <PersonName id={row.document.saved_by} name={row.document.saved_by_name} />
            </>
          )}
        </>
      ) : ''),
    },
  ];
  if (canStart) {
    columns.push({
      key: 'action',
      label: <span className="gt-visually-hidden">Action</span>,
      className: 'documents-tab__action',
      render: (row) => (row.document ? null : (
        <Button
          variant="outline"
          size="sm"
          loading={starting === row.id}
          loadingLabel="Starting…"
          disabled={starting !== null && starting !== row.id}
          onClick={() => { void start(row); }}
        >
          Start{' '}<span className="gt-visually-hidden">{row.title}</span>
        </Button>
      )),
    });
  }

  if (!mine) {
    return (
      <div className="documents-tab" aria-busy="true">
        <Table caption="Documents" columns={columns} rows={[]} loading skeletonRows={3} />
      </div>
    );
  }
  if (!mine.slots) {
    return (
      <EmptyState
        variant="error"
        title="Couldn’t load the team’s documents."
        onRetry={() => {
          setResult(null);
          setReloads((n) => n + 1);
        }}
      />
    );
  }

  const rows: Row[] = mine.slots.map((slot) => ({ ...slot, id: keyOf(slot) }));
  const sprints = rows.filter((row) => row.sprint !== null);
  const endOfTerm = rows.filter((row) => row.sprint === null);

  return (
    <div className="documents-tab">
      {refusal && (
        <Alert tone={refusal.tone} onDismiss={() => setRefusal(null)}>{refusal.message}</Alert>
      )}
      <section className="documents-tab__group" aria-labelledby="documents-tab-sprints">
        <h2 className="documents-tab__title" id="documents-tab-sprints">Sprints</h2>
        <Table
          caption="Sprint documents"
          columns={columns}
          rows={sprints}
          emptyText="No sprints yet: each sprint gets its report here."
        />
      </section>
      <section className="documents-tab__group" aria-labelledby="documents-tab-end">
        <h2 className="documents-tab__title" id="documents-tab-end">End of term</h2>
        <Table caption="End-of-term documents" columns={columns} rows={endOfTerm} />
      </section>
    </div>
  );
}

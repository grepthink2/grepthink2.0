import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileX } from 'lucide-react';
import { Alert } from '@components/Alert/Alert';
import { Button } from '@components/Button/Button';
import { ConfirmDialog } from '@components/ConfirmDialog/ConfirmDialog';
import { EmptyState } from '@components/EmptyState/EmptyState';
import { Skeleton } from '@components/Skeleton/Skeleton';
import { ToastStack } from '@components/Toast/Toast';
import { useToasts } from '@components/Toast/useToasts';
import { api } from '@/lib/api';
import type { ApiTestReportDerived } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import type { AppOutletContext } from '@features/app/appOutletContext';
import ChecksPanel from '../components/ChecksPanel';
import DocumentEditor from '../components/DocumentEditor';
import DocumentShell from '../components/DocumentShell';
import RevisionsDrawer from '../components/RevisionsDrawer';
import { useBoardStories } from '../hooks/useBoardStories';
import { useDocument } from '../hooks/useDocument';
import { useLeaveGuard } from '../hooks/useLeaveGuard';
import { documentChecks, firstBlocking } from '../utils/checks';
import { boardDocumentsPath, documentPath, parseRevision } from '../utils/documentLinks';
import { saveFile } from '../utils/saveFile';
import { storyFacts, storyLabel, storyLookup, type StoryRef } from '../utils/storyRefs';
import '../documents.scss';

/** The read-only preview's calm notice: the guard's own words, as the board's toast says them. */
const PREVIEW_NOTICE = new ReadOnlyPreviewError().message;
/** The API's answer for a revision that does not exist, or was pruned. */
const REVISION_NOT_FOUND = 'Revision not found';

const unknownStory = (id: string): StoryRef => ({ id, state: 'unknown' });

/** The page's shape while the document loads, so nothing shifts when it lands. */
function DocumentSkeleton() {
  return (
    <div className="document-page__skeleton" aria-busy="true">
      <Skeleton width={220} height={26} />
      <Skeleton width={320} height={14} />
      <Skeleton width={260} height={34} radius={8} />
      {[0, 1, 2].map((i) => <Skeleton key={i} height={96} radius={10} />)}
    </div>
  );
}

/**
 * A team's document on its own page (`/app/projects/:projectId/documents/:documentId`, `?revision=n`
 * for another revision): the shell, the checks, the kind's editor, the revisions drawer. A team member
 * edits the head; staff and every other revision read. Unsaved changes hold a navigation away until
 * the reader says to leave. A document of another project is opened under its own.
 */
export default function DocumentPage() {
  const { projectId = '', documentId } = useParams<{ projectId: string; documentId: string }>();
  const [searchParams] = useSearchParams();
  const revision = parseRevision(searchParams.get('revision'));
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  // The preview's state comes from AppView (see AppOutletContext); a page rendered alone has none.
  const isPreviewing = useOutletContext<AppOutletContext | undefined>()?.isPreviewing ?? false;
  const { toasts, push, dismiss } = useToasts();

  // A save the API refuses for a story off the board asks the board about the stories it added. The
  // board's reader comes after the document's hook, so it is read through a ref an effect keeps current.
  const findMissingRef = useRef<(ids: string[]) => Promise<string[]>>(async () => []);
  const findMissingStories = useCallback((ids: string[]) => findMissingRef.current(ids), []);
  const page = useDocument(documentId, { revision, findMissingStories, viewerId: user?.id, isPreviewing });
  const { doc, working, editable, dirty } = page;
  const kind = doc?.document.kind;
  const board = useBoardStories(projectId, editable && (kind === 'release_summary' || kind === 'test_report'));
  useEffect(() => { findMissingRef.current = board.findMissing; }, [board.findMissing]);

  const [deleted, setDeleted] = useState(false);
  const guard = useLeaveGuard(dirty && !deleted);
  const [confirm, setConfirm] = useState<'finalize' | 'delete' | null>(null);
  const [drawer, setDrawer] = useState<{ open: boolean; compare: { older: number; newer: number } | null }>({
    open: false, compare: null,
  });
  const [busyTool, setBusyTool] = useState<'download' | 'copy' | null>(null);

  const story = useMemo(() => (doc ? storyLookup(doc, board.byId) : unknownStory), [doc, board.byId]);
  const storyName = useCallback((id: string) => storyLabel(story(id)), [story]);

  // The hook says one thing at a time; each goes to the toasts once. A save that replaced someone's
  // revision stays until dismissed, and offers to compare the two.
  const { notice, clearNotice } = page;
  useEffect(() => {
    if (!notice) return;
    clearNotice();
    const { compare } = notice;
    if (!compare) {
      push(notice.kind, notice.message);
      return;
    }
    let id: string | number = 0;
    id = push(notice.kind, notice.message, {
      actionLabel: 'View changes',
      duration: 0,
      onAction: () => {
        dismiss(id);
        setDrawer({ open: true, compare });
      },
    });
  }, [notice, clearNotice, push, dismiss]);

  // One address per document and revision: under its own project, and without `?revision=` for the
  // revision this reader opens on anyway (a member's head, staff's hand-in).
  useEffect(() => {
    if (!doc || !documentId) return;
    const info = doc.document;
    const opensOn = doc.access === 'staff' && info.finalized_revision != null ? info.finalized_revision : info.head_revision;
    const keep = revision !== undefined && revision !== opensOn ? revision : undefined;
    if (info.project_id === projectId && keep === revision) return;
    navigate(documentPath(info.project_id, documentId, keep), { replace: true, state: location.state });
  }, [doc, documentId, projectId, revision, navigate, location.state]);

  const checks = useMemo(() => {
    if (!doc || !working || !editable) return [];
    return documentChecks(doc.document.kind, working, {
      sprintEnded: doc.document.sprint ? doc.document.sprint.status === 'completed' : null,
      story: (id) => storyFacts(story(id)),
      uncovered: doc.document.kind === 'test_report' ? (doc.derived as ApiTestReportDerived).uncovered : [],
    });
  }, [doc, working, editable, story]);
  const blocking = firstBlocking(checks);

  const otherVersion = useMemo(() => {
    if (!doc) return null;
    const info = doc.document;
    if (info.status !== 'final' || info.finalized_revision == null) return null;
    const opensOn = doc.access === 'staff' ? info.finalized_revision : info.head_revision;
    const to = (n: number) => documentPath(info.project_id, info.id, n === opensOn ? undefined : n);
    if (doc.revision.number !== info.head_revision) {
      return { label: `Latest draft (revision ${info.head_revision})`, to: to(info.head_revision) };
    }
    if (info.edited_since) {
      return { label: `Handed-in version (revision ${info.finalized_revision})`, to: to(info.finalized_revision) };
    }
    return null;
  }, [doc]);

  const backTo = boardDocumentsPath(projectId);
  const linkState = location.state as { projectName?: string } | null;

  const download = async () => {
    if (!documentId || !doc) return;
    setBusyTool('download');
    try {
      const file = await api.getDocumentMarkdownFile(documentId);
      saveFile(file.text, file.filename ?? `${doc.document.title}.md`);
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Couldn’t download the Markdown.');
    } finally {
      setBusyTool(null);
    }
  };
  const copy = async () => {
    if (!documentId) return;
    setBusyTool('copy');
    try {
      const file = api.getDocumentMarkdownFile(documentId);
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        // Handed the clipboard while the click is still the reason, with the text to come: Safari
        // refuses a write made after the read has finished.
        const text = file.then((f) => new Blob([f.text], { type: 'text/plain' }));
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })]);
      } else {
        await navigator.clipboard.writeText((await file).text);
      }
      push('success', 'Copied the Markdown');
    } catch (err) {
      push('error', err instanceof ApiError ? err.message : 'Couldn’t copy the Markdown.');
    } finally {
      setBusyTool(null);
    }
  };

  let content: ReactNode;
  if (page.loading) {
    content = <DocumentSkeleton />;
  } else if (page.failure || !doc) {
    const failure = page.failure;
    if (failure?.kind === 'not_found' && failure.message === REVISION_NOT_FOUND && revision !== undefined && documentId) {
      content = (
        <EmptyState
          icon={<FileX size={28} />}
          title={`Revision ${revision} is no longer kept`}
          description="Once a sprint or the class is over, only the latest revision and the hand-ins are kept."
          action={<Button variant="outline" to={documentPath(projectId, documentId)}>Open the latest</Button>}
          titleAs="h1"
        />
      );
    } else if (failure?.kind === 'not_found') {
      content = (
        <EmptyState
          icon={<FileX size={28} />}
          title="This document is not here"
          description="It may have been deleted."
          action={<Button variant="outline" to={backTo}>Back to the documents</Button>}
          titleAs="h1"
        />
      );
    } else if (failure?.kind === 'forbidden') {
      content = (
        <EmptyState
          title="You can’t read this document"
          description="A team’s documents are for the team and its class staff."
          titleAs="h1"
        />
      );
    } else {
      content = <EmptyState variant="error" title="Couldn’t load the document." onRetry={page.reload} titleAs="h1" />;
    }
  } else {
    const info = doc.document;
    content = (
      <>
        <DocumentShell
          doc={doc}
          editable={editable}
          dirty={dirty}
          saving={page.saving}
          finalizing={page.finalizing}
          finalizeHold={dirty ? 'Save first' : blocking ? blocking.message : null}
          otherVersion={otherVersion}
          canDelete={doc.can_finalize && info.finalized_revision == null && !isPreviewing}
          downloading={busyTool === 'download'}
          copying={busyTool === 'copy'}
          onSave={() => { void page.save(); }}
          onFinalize={() => setConfirm('finalize')}
          onDelete={() => setConfirm('delete')}
          onDownload={() => { void download(); }}
          onCopy={() => { void copy(); }}
          onRevisions={() => setDrawer({ open: true, compare: null })}
        />
        {isPreviewing && <Alert tone="info">{PREVIEW_NOTICE}</Alert>}
        {page.problems.length > 0 && (
          <Alert tone="error" title="Can’t save yet">
            <ul className="document-page__problems">{page.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </Alert>
        )}
        {editable && <ChecksPanel checks={checks} />}
        <DocumentEditor
          doc={doc}
          body={working ?? doc.body}
          editable={editable}
          onChange={page.setWorking}
          story={story}
          board={board}
        />
        <RevisionsDrawer
          open={drawer.open}
          onClose={() => setDrawer({ open: false, compare: null })}
          documentId={info.id}
          kind={info.kind}
          compare={drawer.compare}
          head={info.head_revision}
          storyName={storyName}
        />
        <ConfirmDialog
          open={confirm === 'finalize'}
          title={`Finalize ${info.title}?`}
          message={`Revision ${page.baseRevision} is handed in. The board’s sections are frozen as they are now, and the team’s TAs are told.`}
          confirmLabel={info.status === 'final' ? 'Finalize again' : 'Finalize'}
          busyLabel="Finalizing…"
          onConfirm={async () => {
            await page.finalize();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
        <ConfirmDialog
          open={confirm === 'delete'}
          title={`Delete ${info.title}?`}
          message={`The draft and its ${info.head_revision === 1 ? 'revision are' : `${info.head_revision} revisions are`} deleted. This can’t be undone.`}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          destructive
          onConfirm={async () => {
            const gone = await page.remove();
            setConfirm(null);
            if (!gone) return;
            setDeleted(true);
            guard.leave(() => navigate(backTo, { replace: true, state: linkState }));
          }}
          onCancel={() => setConfirm(null)}
        />
      </>
    );
  }

  return (
    <div className="document-page">
      <Link to={backTo} state={linkState?.projectName ? { projectName: linkState.projectName } : undefined} className="document-page__back">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to the documents
      </Link>
      {content}
      <ConfirmDialog
        open={guard.blocked}
        title="Leave without saving?"
        message="Your changes to this document are not saved. If you leave now, they are lost."
        confirmLabel="Leave"
        cancelLabel="Stay"
        destructive
        onConfirm={guard.proceed}
        onCancel={guard.stay}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

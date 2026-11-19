import { useCallback, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Download, History, MoreHorizontal, Trash2 } from 'lucide-react';
import { Badge } from '@components/Badge/Badge';
import { Button } from '@components/Button/Button';
import { IconButton } from '@components/IconButton/IconButton';
import { Menu, MenuItem } from '@components/Menu/Menu';
import { Popover } from '@components/Popover/Popover';
import type { ApiProjectDocument } from '@/lib/api';
import { sprintDates } from '@features/scrum/utils/sprints';
import { formatDate, formatWhen } from '../utils/dates';
import { documentState, STATE_BADGE } from '../utils/documentStatus';

interface DocumentShellProps {
  doc: ApiProjectDocument;
  /** A team member edits the revision on screen, the head. */
  editable: boolean;
  dirty: boolean;
  saving: boolean;
  finalizing: boolean;
  /** Why Finalize waits ("Save first", or the first check that fails), or null. */
  finalizeHold: string | null;
  /** The other version of a final document edited since: its link's words and where it goes. */
  otherVersion: { label: string; to: string } | null;
  canDelete: boolean;
  downloading: boolean;
  copying: boolean;
  onSave: () => void;
  onFinalize: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onRevisions: () => void;
}

/** "Saved Nov 17, 2026 at 3:05 PM by Alex Kim": a revision's line. */
function savedLine(doc: ApiProjectDocument): string {
  const { revision } = doc;
  const verb = revision.source === 'seed' ? 'Started' : 'Saved';
  const who = revision.saved_by_name ? ` by ${revision.saved_by_name}` : '';
  return `${verb} ${formatWhen(revision.saved_at)}${who}`;
}

/**
 * The hand-in line of a final document: "Handed in Nov 20, 2026 by Sam Lee, revision 5" on the revision
 * handed in, the same about the latest hand-in on a draft saved since, and the date alone on an older
 * hand-in, whose finalizer the API does not name.
 */
function handInLine(doc: ApiProjectDocument): string | null {
  const info = doc.document;
  if (info.status !== 'final' || info.finalized_revision == null) return null;
  const onScreen = doc.revision.number;
  if (doc.revision.finalized_at && onScreen !== info.finalized_revision) {
    return `Handed in ${formatDate(doc.revision.finalized_at)}, revision ${onScreen}`;
  }
  const by = info.finalized_by_name ? ` by ${info.finalized_by_name}` : '';
  const line = `Handed in ${formatDate(info.finalized_at)}${by}, revision ${info.finalized_revision}`;
  // The head of a document saved again since the hand-in is a draft beyond it.
  return onScreen === info.head_revision && onScreen !== info.finalized_revision
    ? `${line}. This draft has changes since.`
    : line;
}

/**
 * What Download Markdown and Copy give when it is not the revision on screen: the API renders the
 * latest hand-in of a document handed in, else the head.
 */
function markdownNote(doc: ApiProjectDocument): string | null {
  const info = doc.document;
  if (info.finalized_revision != null) {
    return doc.revision.number === info.finalized_revision
      ? null
      : `Download Markdown and Copy give the handed-in version (revision ${info.finalized_revision}).`;
  }
  return doc.revision.number === info.head_revision
    ? null
    : `Download Markdown and Copy give the latest draft (revision ${info.head_revision}).`;
}

/**
 * A document page's head: its title and state, the revision on screen and who saved it, the hand-in
 * line of a final document with a link to its other version, and the actions. Save (the primary,
 * busy while saving) and Finalize are a team member's on the head; Finalize waits while the body is
 * unsaved or a check fails, and says why beside it. Download Markdown, Copy and Revisions are every
 * reader's, with a note under them when they give another revision than the one on screen. Delete,
 * for a draft never handed in, sits in the overflow menu.
 */
export default function DocumentShell({
  doc, editable, dirty, saving, finalizing, finalizeHold, otherVersion, canDelete, downloading, copying,
  onSave, onFinalize, onDelete, onDownload, onCopy, onRevisions,
}: DocumentShellProps) {
  const info = doc.document;
  const state = documentState(info);
  const holdId = useId();
  const markdownId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const head = info.head_revision;
  const onScreen = doc.revision.number;
  const handIn = handInLine(doc);
  const markdown = markdownNote(doc);
  // Finalize hands in the head; a final document not saved since has nothing new to hand in.
  const finalizable = editable && doc.can_finalize && !(info.status === 'final' && !info.edited_since);

  // Focus on a menu item would go down with the menu, so it goes back to the trigger. Stable, so
  // Popover keeps its listeners.
  const closeMenu = useCallback(() => {
    if (document.activeElement?.closest('.document-page__menu')) moreRef.current?.focus({ preventScroll: true });
    setMenuOpen(false);
  }, []);

  return (
    <header className="document-page__head">
      <div className="document-page__title-row">
        <h1 className="document-page__title">{info.title}</h1>
        <Badge status={STATE_BADGE[state]} />
      </div>
      {info.sprint && <p className="document-page__meta">{info.sprint.name} · {sprintDates(info.sprint)}</p>}
      <p className="document-page__meta">
        <span>Revision {onScreen}{onScreen !== head ? ` of ${head}` : ''}</span>
        <span aria-hidden="true"> · </span>
        <span>{savedLine(doc)}</span>
      </p>
      {handIn && <p className="document-page__meta document-page__meta--hand-in">{handIn}</p>}
      {otherVersion && (
        <Link className="document-page__version" to={otherVersion.to}>{otherVersion.label}</Link>
      )}

      <div className="document-page__actions">
        {editable && (
          <span className="document-page__save">
            <Button size="sm" onClick={onSave} disabled={!dirty} loading={saving} loadingLabel="Saving…">Save</Button>
            {/* In place from the start, so a screen reader hears the change from saved to not. */}
            <span className="document-page__save-state" aria-live="polite">
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
          </span>
        )}
        {finalizable && (
          <span className="document-page__finalize">
            <Button
              variant="outline"
              size="sm"
              disabled={finalizeHold !== null}
              aria-describedby={finalizeHold !== null ? holdId : undefined}
              loading={finalizing}
              loadingLabel="Finalizing…"
              onClick={onFinalize}
            >
              {info.status === 'final' ? 'Finalize again' : 'Finalize'}
            </Button>
            {finalizeHold !== null && <span className="document-page__hold" id={holdId}>{finalizeHold}</span>}
          </span>
        )}
        <span className="document-page__tools">
          <Button
            variant="outline"
            size="sm"
            iconLeft={<Download size={14} />}
            loading={downloading}
            loadingLabel="Downloading…"
            aria-describedby={markdown ? markdownId : undefined}
            onClick={onDownload}
          >
            Download Markdown
          </Button>
          <Button
            variant="outline"
            size="sm"
            iconLeft={<Copy size={14} />}
            loading={copying}
            loadingLabel="Copying…"
            aria-describedby={markdown ? markdownId : undefined}
            onClick={onCopy}
          >
            Copy
          </Button>
          <Button variant="outline" size="sm" iconLeft={<History size={14} />} onClick={onRevisions}>Revisions</Button>
          {canDelete && (
            <Popover
              open={menuOpen}
              onClose={closeMenu}
              align="end"
              padded={false}
              anchor={(
                <IconButton
                  ref={moreRef}
                  ariaLabel="More actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <MoreHorizontal size={16} />
                </IconButton>
              )}
            >
              <Menu ariaLabel="More actions" autoFocus onClose={closeMenu} className="document-page__menu">
                <MenuItem
                  destructive
                  icon={<Trash2 size={15} aria-hidden="true" />}
                  onSelect={() => {
                    closeMenu();
                    onDelete();
                  }}
                >
                  Delete draft
                </MenuItem>
              </Menu>
            </Popover>
          )}
        </span>
      </div>
      {markdown && <p className="document-page__markdown-note" id={markdownId}>{markdown}</p>}
    </header>
  );
}

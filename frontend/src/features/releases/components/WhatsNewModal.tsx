import { lazy, Suspense, useRef } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';
import { Modal } from '@/components/Modal/Modal';
import { loadReleaseFeed } from '../loadReleaseFeed';
import { APP_VERSION } from '../version';
import { ReleaseFeedFailed, ReleaseFeedLoading } from './ReleaseFeedStates';
import './releases.scss';

// Created once: the kit's Modal mounts its body only while open, so the import starts at the first open.
const ReleaseFeed = lazy(loadReleaseFeed);

export interface WhatsNewModalProps {
  open: boolean;
  onClose: () => void;
  /** 'dark' on the landing page, 'light' in the app. */
  tone: 'light' | 'dark';
  /**
   * The release this browser had seen when the modal opened. Releases newer than it carry "New"; the host
   * keeps it while the modal is open, so marking the version seen does not move the markers.
   */
  lastSeen: string | null;
}

/**
 * The release notes in the kit's Modal, ported from design/components/releases/WhatsNewModal.jsx: the
 * title "What's new", the subtitle "Version x.y.z" (this build), the kit's ×, the feed scrolling in the
 * body and no footer. The frame ships with the page and the feed is a chunk of its own, so a chunk that
 * fails to load (a tab left open across a deploy) shows the failed state with "Reload" here, never the
 * app's top-level error screen. The body is a focusable scroll region named "Release notes", and focus
 * starts there, so the arrow keys and Page Up/Down scroll a long feed; Tab moves between it and the ×.
 * The rest of the dialog behaviour is the kit's: focus trapped, and back to the opener on close.
 */
export function WhatsNewModal({ open, onClose, tone, lastSeen }: WhatsNewModalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      tone={tone}
      size="md"
      title="What's new"
      subtitle={`Version ${APP_VERSION}`}
      className="gt-whats-new"
      bodyLabel="Release notes"
      bodyRef={bodyRef}
      initialFocusRef={bodyRef}
    >
      <ErrorBoundary fallback={<ReleaseFeedFailed tone={tone} />}>
        <Suspense fallback={<ReleaseFeedLoading tone={tone} />}>
          <ReleaseFeed lastSeen={lastSeen} tone={tone} />
        </Suspense>
      </ErrorBoundary>
    </Modal>
  );
}

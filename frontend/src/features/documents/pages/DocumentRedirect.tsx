import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileX } from 'lucide-react';
import { EmptyState } from '@components/EmptyState/EmptyState';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import PageFallback from '@features/app/components/PageFallback';
import { documentPath } from '../utils/documentLinks';

/**
 * `/app/documents/:documentId`, for a link that knows only the document (a "document finalized"
 * notification): reads the document and opens it under its project, in place of this address.
 */
export default function DocumentRedirect() {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const [failure, setFailure] = useState<{ documentId: string; status: number } | null>(null);

  useEffect(() => {
    if (!documentId) return;
    let active = true;
    // A promise chain: react-hooks/set-state-in-effect accepts setState in its callbacks.
    api
      .getDocument(documentId)
      .then((doc) => {
        if (active) navigate(documentPath(doc.document.project_id, documentId), { replace: true });
      })
      .catch((err: unknown) => {
        if (active) setFailure({ documentId, status: err instanceof ApiError ? err.status : 0 });
      });
    return () => { active = false; };
  }, [documentId, navigate]);

  const failed = failure && failure.documentId === documentId ? failure : null;
  if (!failed) return <PageFallback />;
  return (
    <div className="document-page">
      <EmptyState
        icon={<FileX size={28} />}
        titleAs="h1"
        title={failed.status === 404 ? 'This document is not here' : failed.status === 403 ? 'You can’t read this document' : 'Couldn’t open the document'}
        description={failed.status === 404
          ? 'It may have been deleted.'
          : failed.status === 403 ? 'A team’s documents are for the team and its class staff.' : 'Try again in a moment.'}
      />
    </div>
  );
}

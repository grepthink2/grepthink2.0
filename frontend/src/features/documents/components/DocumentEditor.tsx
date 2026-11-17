import type {
  ApiDocumentBody,
  ApiProjectDocument,
  ApiReleaseSummaryBody,
  ApiSprintReportBody,
  ApiTestReportBody,
} from '@/lib/api';
import type { ProjectStories } from '../hooks/useProjectStories';
import type { StoryRef } from '../utils/storyRefs';
import ReleaseSummaryEditor from './ReleaseSummaryEditor';
import SprintReportEditor from './SprintReportEditor';
import TestReportEditor from './TestReportEditor';

interface DocumentEditorProps {
  doc: ApiProjectDocument;
  /** The body on screen: the one being edited, or the revision's. */
  body: ApiDocumentBody;
  editable: boolean;
  onChange: (body: ApiDocumentBody) => void;
  story: (id: string) => StoryRef;
  board: ProjectStories;
}

/** The editor for the document's kind, read only when the revision on screen is not being edited. */
export default function DocumentEditor({ doc, body, editable, onChange, story, board }: DocumentEditorProps) {
  switch (doc.document.kind) {
    case 'sprint_report':
      return (
        <SprintReportEditor
          doc={doc as ApiProjectDocument<'sprint_report'>}
          body={body as ApiSprintReportBody}
          editable={editable}
          onChange={onChange}
        />
      );
    case 'release_summary':
      return (
        <ReleaseSummaryEditor
          doc={doc as ApiProjectDocument<'release_summary'>}
          body={body as ApiReleaseSummaryBody}
          editable={editable}
          onChange={onChange}
          story={story}
          board={board}
        />
      );
    case 'test_report':
      return (
        <TestReportEditor
          doc={doc as ApiProjectDocument<'test_report'>}
          body={body as ApiTestReportBody}
          editable={editable}
          onChange={onChange}
          story={story}
          board={board}
        />
      );
    default:
      return null;
  }
}

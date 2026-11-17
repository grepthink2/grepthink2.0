import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { boardDocumentsPath } from '../utils/documentLinks';
import type { HandIns } from '../utils/handIns';
import './HandInLink.scss';

interface HandInLinkProps {
  projectId: string;
  teamName: string;
  counts: HandIns;
}

/**
 * A team's documents for its staff, where the class's teams are listed: "2 of 5 handed in", a link to
 * the team's Documents tab. The counts are the documents the team has made.
 */
export default function HandInLink({ projectId, teamName, counts }: HandInLinkProps) {
  const label = `${counts.handedIn} of ${counts.total} handed in`;
  return (
    // The name starts with the words on screen, and says whose documents they are.
    <Link className="hand-in-link" to={boardDocumentsPath(projectId)} aria-label={`${label}: the documents of ${teamName}`}>
      <FileText size={13} aria-hidden="true" />
      {label}
    </Link>
  );
}

import type { ReactNode } from 'react';
import { ChevronRight, FileText, SquareKanban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@components/Card/Card';
import type { ApiPersonSharedClass } from '@/lib/api';
import { classLabel, type StaffLink } from '../peopleModel';

const ICONS: Record<StaffLink['key'], ReactNode> = {
  board: <SquareKanban size={16} aria-hidden="true" />,
  documents: <FileText size={16} aria-hidden="true" />,
};

interface ProfileStaffLinksProps {
  /** `staffGroups()`'s answer: a class the viewer is staff of, and the staff views of the person's team there. */
  groups: { entry: ApiPersonSharedClass; links: StaffLink[] }[];
}

/**
 * "For staff" on a person's page: the staff views of the person's team, for each class where the
 * viewer is a TA or the instructor and the person is a student on a team. One group per class,
 * under the class's name when there is more than one. The card says who sees it.
 */
export function ProfileStaffLinks({ groups }: ProfileStaffLinksProps) {
  if (groups.length === 0) return null;
  const many = groups.length > 1;
  const whose = many ? 'these classes' : classLabel(groups[0].entry);
  return (
    <Card
      titleAs="h3"
      title="For staff"
      subtitle={`Only TAs and instructors of ${whose} see this.`}
      className="gt-profile-staff"
    >
      {groups.map(({ entry, links }) => {
        const team = entry.team?.name ?? '';
        return (
          <div key={entry.class_id} className="gt-profile-staff__group">
            {many && (
              <p className="gt-profile-staff__class">
                {classLabel(entry)} · {team}
              </p>
            )}
            <ul className="gt-profile-staff__links" aria-label={`${classLabel(entry)}, ${team}`}>
              {links.map((link) => (
                <li key={link.key}>
                  <Link className="gt-profile-staff__link" to={link.to}>
                    <span className="gt-profile-staff__icon">{ICONS[link.key]}</span>
                    <span className="gt-profile-staff__text">
                      <span className="gt-profile-staff__label">{link.label}</span>
                      <span className="gt-profile-staff__detail">{link.detail}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </Card>
  );
}

import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AvatarGroup } from '@components/Avatar/Avatar';
import { Badge } from '@components/Badge/Badge';
import { Card } from '@components/Card/Card';
import type { ApiPersonSharedClass } from '@/lib/api';
import { classLabel, classRoleLabel, displayName, teamPath, termLabel } from '../peopleModel';

/** What a class's card says when the person has no team there. */
function noTeamLine(role: ApiPersonSharedClass['role']): string {
  if (role === 'ta') return 'Teaching assistant in this class.';
  if (role === 'instructor') return 'Teaches this class.';
  return 'Not on a team in this class yet.';
}

/** "Software Engineering · Fall 2026 · Student": the class's name when the title is its code. */
function subtitleOf(entry: ApiPersonSharedClass): string {
  const titledByCode = Boolean(entry.course_code?.trim());
  return [titledByCode ? entry.class_name : null, termLabel(entry.term, entry.year), classRoleLabel(entry.role)]
    .filter(Boolean)
    .join(' · ');
}

/**
 * "Teams" on a person's page: a card for each class shared with them, in the order given. A card
 * holds the class, its term and the person's role there, then their team (its name leads to the
 * team's page), their project role, their teammates and "Open team page". Without a team it says
 * so, in the words for that role. Nobody but the person themself sees an empty list.
 */
export function ProfileTeams({ shared }: { shared: ApiPersonSharedClass[] }) {
  return (
    <section className="gt-profile-teams" aria-labelledby="gt-profile-teams-title">
      <h3 id="gt-profile-teams-title" className="gt-profile-section__title">
        Teams
      </h3>
      {shared.length === 0 ? (
        <p className="gt-profile-teams__none">You’re not in a class yet.</p>
      ) : (
        <div className="gt-profile-teams__grid">
          {shared.map((entry) => {
            const team = entry.team;
            return (
              <Card
                key={entry.class_id}
                bordered
                titleAs="h4"
                title={classLabel(entry)}
                subtitle={subtitleOf(entry)}
                className="gt-profile-team"
              >
                {team ? (
                  <div className="gt-profile-team__body">
                    <div className="gt-profile-team__row">
                      <Link className="gt-profile-team__name" to={teamPath(team.project_id)}>
                        {team.name}
                      </Link>
                      {team.project_role && <Badge projectRole={team.project_role} />}
                    </div>
                    {team.members.length > 0 && (
                      <div className="gt-profile-team__mates">
                        <AvatarGroup names={team.members.map((m) => displayName(m.name))} max={5} size="sm" />
                        <span className="gt-profile-team__count">
                          {team.members.length} {team.members.length === 1 ? 'teammate' : 'teammates'}
                        </span>
                      </div>
                    )}
                    <Link
                      className="gt-profile-team__open"
                      to={teamPath(team.project_id)}
                      aria-label={`Open team page, ${team.name}`}
                    >
                      Open team page
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                ) : (
                  <p className="gt-profile-team__empty">{noTeamLine(entry.role)}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

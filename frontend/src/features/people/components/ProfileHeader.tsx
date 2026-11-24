import type { ReactNode } from 'react';
import { Mail, MessageCircleMore, School, UserPen } from 'lucide-react';
import { Avatar } from '@components/Avatar/Avatar';
import { Button } from '@components/Button/Button';
import { Tag } from '@components/Tag/Tag';
import { GithubIcon, LinkedinIcon } from '@components/icons/BrandIcons';
import { useMessageUser } from '@features/messages/hooks/useMessageUser';
import { openSettings } from '@/lib/openSettings';
import type { ApiPersonProfile } from '@/lib/api';
import {
  classLabel,
  classRoleLabel,
  displayName,
  githubLink,
  linkedinLink,
  schoolEmailOf,
  schoolsOf,
} from '../peopleModel';

interface HeaderLink {
  key: string;
  href: string;
  icon: ReactNode;
  /** What the link shows: the address without its scheme, or the email. */
  label: string;
  /** What the link is called: whose it is, and where it leads. */
  name: string;
  external?: boolean;
  mono?: boolean;
}

interface ProfileHeaderProps {
  profile: ApiPersonProfile;
  /** A class is being viewed as a student: show what a classmate sees. */
  isPreviewing: boolean;
}

/**
 * The top of a person's page: the avatar, the name (an h2, under the app header's "Profile"), the
 * schools of the classes shared, a Tag for each of those classes ("CSE 115A · Student"), and the
 * person's links: GitHub, LinkedIn and, when the answer carries it, the school email. One action:
 * "Edit profile" on your own page, which opens Settings, and "Message" on anyone else's.
 */
export function ProfileHeader({ profile, isPreviewing }: ProfileHeaderProps) {
  const { person, shared, is_self: isSelf } = profile;
  const message = useMessageUser();
  const name = displayName(person.name);
  // Someone with no name is not called "No name yet" in a link's name.
  const named = Boolean(person.name?.trim());
  const schools = schoolsOf(shared);
  const github = githubLink(person.github);
  const linkedin = linkedinLink(person.linkedin);
  const email = schoolEmailOf(profile, isPreviewing);

  const links: HeaderLink[] = [];
  if (github) {
    links.push({
      key: 'github',
      href: github.href,
      icon: <GithubIcon size={15} aria-hidden="true" />,
      label: github.label,
      name: named ? `${name} on GitHub` : 'GitHub profile',
      external: true,
    });
  }
  if (linkedin) {
    links.push({
      key: 'linkedin',
      href: linkedin.href,
      icon: <LinkedinIcon size={15} aria-hidden="true" />,
      label: linkedin.label,
      name: named ? `${name} on LinkedIn` : 'LinkedIn profile',
      external: true,
    });
  }
  if (email) {
    links.push({
      key: 'email',
      href: `mailto:${email}`,
      icon: <Mail size={15} aria-hidden="true" />,
      label: email,
      name: named ? `Email ${name} at ${email}` : `Email ${email}`,
      mono: true,
    });
  }

  return (
    <header className="gt-profile-header">
      <Avatar
        name={named ? name : undefined}
        src={person.image_url || undefined}
        size="xl"
        decorative
        className="gt-profile-header__avatar"
      />
      <div className="gt-profile-header__main">
        <h2 className="gt-profile-header__name">{name}</h2>
        {schools.length > 0 && (
          <p className="gt-profile-header__school">
            <School size={15} aria-hidden="true" />
            {schools.join(' · ')}
          </p>
        )}
        {shared.length > 0 && (
          <ul className="gt-profile-header__roles" aria-label={isSelf ? 'Your classes' : 'Classes you share'}>
            {shared.map((entry) => (
              <li key={entry.class_id}>
                <Tag>
                  {classLabel(entry)} · {classRoleLabel(entry.role)}
                </Tag>
              </li>
            ))}
          </ul>
        )}
        {links.length > 0 ? (
          <ul className="gt-profile-header__links" aria-label="Links">
            {links.map((link) => (
              <li key={link.key}>
                <a
                  className={`gt-profile-header__link${link.mono ? ' gt-profile-header__link--mono' : ''}`}
                  href={link.href}
                  aria-label={link.name}
                  {...(link.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {link.icon}
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="gt-profile-header__nolinks">{isSelf ? 'No GitHub or LinkedIn yet.' : 'No links added.'}</p>
        )}
      </div>
      <div className="gt-profile-header__actions">
        {isSelf ? (
          <Button
            variant="outline"
            size="sm"
            iconLeft={<UserPen size={15} aria-hidden="true" />}
            onClick={() => openSettings('profile')}
          >
            Edit profile
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            iconLeft={<MessageCircleMore size={15} aria-hidden="true" />}
            onClick={() => message(person.id, named ? name : null)}
          >
            Message
          </Button>
        )}
      </div>
    </header>
  );
}

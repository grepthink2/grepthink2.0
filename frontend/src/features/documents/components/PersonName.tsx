import { PersonLink } from '@components/PersonLink/PersonLink';

interface PersonNameProps {
  /** The person's id; null when the API names them without one. */
  id: string | null;
  name: string;
}

/** A person named in a line of text: a link to their page when their id is known, else the name. */
export function PersonName({ id, name }: PersonNameProps) {
  return id ? <PersonLink person={{ id, name }} variant="inline" /> : <>{name}</>;
}

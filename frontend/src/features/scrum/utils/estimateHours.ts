/** Whole hours, 1 to 15 (a course takes about 15 hours of a student's week). A pattern rather
 *  than Number(), so "1e1", "2.5" or "04" never pass as hours. */
const WHOLE_HOURS = /^(?:[1-9]|1[0-5])$/;

/**
 * Read the task editor's hours box. Empty is no estimate, not an error. `badInput` is the box's
 * `validity.badInput`: Firefox and Safari report text a number box cannot read ("4h") as an empty
 * value, which on its own would pass for "cleared" and wipe the estimate on Save.
 */
export function parseHours(value: string, badInput = false): { hours: number | null; invalid: boolean } {
  if (badInput) return { hours: null, invalid: true };
  const trimmed = value.trim();
  if (trimmed === '') return { hours: null, invalid: false };
  return WHOLE_HOURS.test(trimmed)
    ? { hours: Number(trimmed), invalid: false }
    : { hours: null, invalid: true };
}

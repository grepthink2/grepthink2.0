/**
 * The zone to use when no school's is known: Pacific, the zone of UC Santa Cruz and the backend's
 * `DEFAULT_TIMEZONE` (`app/institutions/controller.py`) for a class with no school.
 *
 * A last resort, never a default for a caller to lean on. The zone of a class's school comes from
 * `useSchoolTimezone` (`lib/institutions.ts`), which answers this one only while the schools list
 * loads, for a class with no school and for a zone this browser does not know; `viewerZone`
 * (`features/schedule/scheduleModel.ts`) answers it when the browser cannot say where it is. Everything
 * else is handed the zone it works in, so a caller that leaves one out is a type error, not a Pacific time.
 */
export const SCHOOL_ZONE = 'America/Los_Angeles';

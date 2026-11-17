/**
 * What a document body may hold, mirrored from backend/app/documents/models.py, whose names these
 * keep. The API measures every text once it is trimmed and refuses a body past any of them (422), so
 * the page refuses to save one first and names the field (`prepareBody` in utils/documentBody.ts).
 */

// ----- Sprint report -----

/** Actions in each of the three lists (stop, start, keep). */
export const ACTIONS_MAX = 10;
/** An action, 1 to this many characters. */
export const ACTION_MAX = 200;
export const REASON_MAX = 400;
/** Why the team has nothing to stop doing. */
export const SATISFIED_NOTE_MAX = 600;

// ----- Release summary -----

export const KEY_STORIES_MAX = 30;
export const KNOWN_PROBLEMS_MAX = 40;
/** A known problem's text, 1 to this many characters. */
export const PROBLEM_MAX = 400;
export const FOLLOW_UPS_MAX = 20;
/** A follow-up's text, 1 to this many characters. */
export const FOLLOW_UP_MAX = 300;

// ----- Test plan and report -----

export const SCENARIOS_MAX = 60;
/** A scenario's title, 1 to this many characters. */
export const SCENARIO_TITLE_MAX = 120;
/** The stories one scenario covers. */
export const SCENARIO_STORIES_MAX = 5;
/** A scenario's steps (Markdown). */
export const STEPS_MAX = 2000;
/** A scenario's note, and a unit-test entry's. */
export const NOTE_MAX = 300;
export const UNIT_TESTS_MAX = 20;
/** Where some unit tests live, a path or a URL: 1 to this many characters. */
export const LOCATION_MAX = 300;
export const UNIT_TESTS_NOTE_MAX = 600;

/**
 * The most a body may take as compact UTF-8 JSON (the controller's `_SIZE_MAX`); past it the API
 * answers "This document is too long".
 */
export const BODY_BYTES_MAX = 200_000;

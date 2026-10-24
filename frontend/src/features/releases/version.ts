/** The release this build is: frontend/package.json's version, which vite.config.ts defines. */
export const APP_VERSION: string = __APP_VERSION__;

/** MAJOR.MINOR.PATCH, each a whole number with no leading zero; no prefix and no pre-release suffix. */
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** A version's three numbers, or null when the text is not exactly MAJOR.MINOR.PATCH. */
export function parseVersion(value: string): readonly [number, number, number] | null {
  const match = VERSION_PATTERN.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Orders versions by number (0.9.0 before 0.10.0): negative when a comes first, zero when equal. */
export function compareVersions(a: string, b: string): number {
  const left = parseOrThrow(a);
  const right = parseOrThrow(b);
  for (let part = 0; part < 3; part++) {
    if (left[part] !== right[part]) return left[part] - right[part];
  }
  return 0;
}

function parseOrThrow(value: string): readonly [number, number, number] {
  const parsed = parseVersion(value);
  if (!parsed) throw new Error(`Not a version: ${value}`);
  return parsed;
}

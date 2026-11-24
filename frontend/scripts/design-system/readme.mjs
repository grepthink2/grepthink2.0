/**
 * The brand book: `design-system/README.md`, written by hand and published as the artifact's
 * README.md. The build replaces its one `<!-- icons -->` line with the names `Icon` places (the
 * lucide icons src/ imports), so its Iconography section lists exactly those.
 *
 * The page of a system synced from code appends nothing to the README, so the brand book carries
 * its own section on using the system: the namespace, what to load, and the fonts link.
 */

import { FONTS } from './previews.mjs';

export const README_CAP = 200 * 1024;
export const ICONS_MARKER = '<!-- icons -->';

/**
 * @param {string} source design-system/README.md
 * @param {string[]} icons the icon names Icon carries
 * @returns {string} README.md as it is published
 */
export function brandBook(source, icons) {
  const lines = source.split('\n');
  const at = lines.flatMap((line, index) => (line.trim() === ICONS_MARKER ? [index] : []));
  if (at.length !== 1) {
    throw new Error(`design-system/README.md needs one ${ICONS_MARKER} line, where the build lists the icons; it has ${at.length}`);
  }
  const indent = /^\s*/.exec(lines[at[0]])[0];
  lines[at[0]] = `${indent}${icons.map((name) => `\`${name}\``).join(', ')}.`;
  return lines.join('\n');
}

/**
 * The problems that keep a built README.md from being published.
 * @param {string} text README.md as built
 * @param {string[]} icons the icon names Icon carries
 * @returns {string[]}
 */
export function brandBookProblems(text, icons) {
  const problems = [];
  if (Buffer.byteLength(text) > README_CAP) problems.push('README.md is over 200 KB');
  if (text.includes(ICONS_MARKER)) problems.push(`README.md still holds the ${ICONS_MARKER} line`);
  const unlisted = icons.filter((name) => !text.includes(`\`${name}\``));
  if (unlisted.length) problems.push(`README.md does not list the icons ${unlisted.join(', ')}`);
  if (!text.includes(FONTS)) problems.push('README.md does not give the fonts link the previews load');
  return problems;
}

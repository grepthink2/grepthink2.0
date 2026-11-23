/**
 * The fourth check of `npm run lint:design`: every kit component carries its guide and its preview.
 *
 * Each folder of src/components/ (PREVIEW_FOLDERS_LEFT_OUT aside), and Icon in design-system/runtime/,
 * holds `README.md` (guides.mjs) and `<Folder>.preview.tsx` (previews.mjs). A missing file is named
 * with its folder; a preview's `meta` is held to the contract (readPreview), and each guide to its
 * preview (checkGuide).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { collectKitExports } from './exports.mjs';
import { checkGuide } from './guides.mjs';
import { PREVIEW_FOLDERS_LEFT_OUT, readPreview } from './previews.mjs';

const missing = (folder, file) =>
  `design-adherence: ${folder} has no ${file} (every kit component carries a guide and a preview; see docs/agents/frontend.md)`;

/**
 * @param {{ componentsDir: string; runtimeDir: string }} options src/components, and the
 *   design-system runtime that holds Icon
 * @returns {string[]} the problems, each a line of lint:design's report
 */
export function checkKitDocs({ componentsDir, runtimeDir }) {
  const exports = [...collectKitExports(componentsDir), { name: 'Icon' }];
  const homes = readdirSync(componentsDir)
    .sort()
    .filter((folder) => !PREVIEW_FOLDERS_LEFT_OUT.includes(folder) && statSync(join(componentsDir, folder)).isDirectory())
    .map((folder) => ({ folder, dir: join(componentsDir, folder), shown: `${folder}/`, importsFrom: componentsDir }));
  if (existsSync(join(runtimeDir, 'Icon.tsx'))) {
    homes.push({ folder: 'Icon', dir: runtimeDir, shown: 'design-system/runtime/', importsFrom: runtimeDir });
  }

  const problems = [];
  for (const { folder, dir, shown, importsFrom } of homes) {
    const guidePath = join(dir, 'README.md');
    const previewName = `${folder}.preview.tsx`;
    const previewPath = join(dir, previewName);
    const hasGuide = existsSync(guidePath);
    const hasPreview = existsSync(previewPath);
    if (!hasGuide) problems.push(missing(folder, 'README.md'));
    if (!hasPreview) problems.push(missing(folder, previewName));
    if (!hasGuide || !hasPreview) continue;
    try {
      readPreview({ path: previewPath, file: `${shown}${previewName}`, folder, componentsDir: importsFrom, exports });
    } catch (error) {
      problems.push(`design-adherence: ${error.message}`);
      continue;
    }
    const found = checkGuide({ text: readFileSync(guidePath, 'utf8'), previewSource: readFileSync(previewPath, 'utf8'), exports });
    problems.push(...found.map((problem) => `design-adherence: ${shown}README.md: ${problem}`));
  }
  return problems;
}

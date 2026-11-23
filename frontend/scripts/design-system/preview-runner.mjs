/**
 * Runs the preview builds buildPreviews (previews.mjs) asks for, one Vite library build per
 * preview, in this one Node process: `node preview-runner.mjs <entries.json>`, where the file
 * lists `{ name, entry }`. vite.design-preview.config.ts reads the preview to build from
 * DESIGN_PREVIEW_ENTRY and DESIGN_PREVIEW_NAME. Exits 1 on the first failure.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const configFile = fileURLToPath(new URL('../../vite.design-preview.config.ts', import.meta.url));
const entries = JSON.parse(readFileSync(process.argv[2], 'utf8'));

try {
  for (const { name, entry } of entries) {
    process.env.DESIGN_PREVIEW_ENTRY = entry;
    process.env.DESIGN_PREVIEW_NAME = name;
    await build({ configFile, logLevel: 'warn' });
  }
} catch (error) {
  console.error(error?.message ?? error);
  process.exit(1);
}

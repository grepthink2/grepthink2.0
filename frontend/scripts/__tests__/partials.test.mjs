// @vitest-environment node
import * as sass from 'sass';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const styles = fileURLToPath(new URL('../../src/styles/', import.meta.url));

// Compressed, as the production build minifies it: the partials' doc comments are not CSS
// that ships, so only rules (and keyframes) count.
it('the forwarded style partials emit no CSS, so every @use is free', () => {
  const { css } = sass.compileString("@use 'index' as *;", {
    loadPaths: [styles],
    style: 'compressed',
  });
  expect(css.trim()).toBe('');
});

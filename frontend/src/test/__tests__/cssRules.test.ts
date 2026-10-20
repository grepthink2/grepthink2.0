import { afterEach, expect, it } from 'vitest';
import { cssRules } from '../cssRules';

let sheet: HTMLStyleElement | null = null;
afterEach(() => {
  sheet?.remove();
  sheet = null;
});

function addStyles(css: string) {
  sheet = document.createElement('style');
  sheet.textContent = css;
  document.head.append(sheet);
}

it('reads rules inside every grouping rule, with their conditions joined', () => {
  addStyles(`
    .probe { color: red; }
    @layer kit { .probe { margin: 1px; } }
    @media (max-width: 767px) { .probe, .other { min-height: 44px; } }
    @supports (display: grid) { @media (prefers-reduced-motion: reduce) { .probe { animation: none; } } }
    @container card (min-width: 400px) { .probe { padding: 2px; } }
  `);

  // A layer adds no condition, so its rules count as unconditional.
  expect(cssRules('.probe').map((style) => style.cssText)).toEqual(['color: red;', 'margin: 1px;']);
  expect(cssRules('.probe', 'max-width: 767px').map((style) => style.minHeight)).toEqual(['44px']);
  expect(cssRules('.other', 'max-width: 767px')).toHaveLength(1);
  expect(cssRules('.probe', 'display: grid').map((style) => style.animation)).toEqual(['none']);
  expect(cssRules('.probe', 'prefers-reduced-motion')).toHaveLength(1);
  expect(cssRules('.probe', 'min-width: 400px').map((style) => style.padding)).toEqual(['2px']);
});

it('keeps a selector list whole across commas inside parentheses', () => {
  addStyles('.probe:not(:disabled, [aria-disabled="true"]) { color: red; }');
  expect(cssRules('.probe:not(:disabled, [aria-disabled="true"])')).toHaveLength(1);
  expect(cssRules('.probe:not(:disabled')).toHaveLength(0);
});

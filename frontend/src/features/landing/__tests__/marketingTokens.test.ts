import { describe, expect, it } from 'vitest';
import marketingCss from '@/styles/tokens/marketing.css?raw';
import landingScss from '../_landing-tokens.scss?raw';

// The design system lists the public site's core colours from styles/tokens/marketing.css, while
// the landing's stylesheets read the Sass copy. The two must not drift.
const cssTokens = [...marketingCss.matchAll(/^\s*--gt-mkt-([a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()] as const);
const sassTokens = new Map([...landingScss.matchAll(/^\$mkt-([a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()] as const));

describe('marketing tokens', () => {
  it('lists the core palette', () => {
    expect(cssTokens.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cssTokens)('--gt-mkt-%s equals $mkt-%s', (name, value) => {
    expect(sassTokens.get(name)).toBe(value);
  });
});

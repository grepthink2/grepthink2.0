/**
 * The declarations the document's stylesheets give one selector, for tests of CSS that jsdom cannot
 * lay out (a phone size, a reduced-motion rule). Vitest compiles every stylesheet a test imports and
 * adds it to the document (`css: true` in vite.config.ts), so a component's own rules are here once
 * the test imports the component.
 *
 * `selector` matches one selector of a rule's list exactly, as Sass writes it. Without `media`, only
 * rules outside any @media count; with it, only rules inside an @media whose condition contains it
 * (`'max-width: 767px'`, `'prefers-reduced-motion'`).
 */
export function cssRules(selector: string, media?: string): CSSStyleDeclaration[] {
  const found: CSSStyleDeclaration[] = [];
  const walk = (rules: CSSRuleList, condition: string | null) => {
    for (const rule of Array.from(rules)) {
      if ('media' in rule && 'cssRules' in rule) {
        walk((rule as CSSMediaRule).cssRules, (rule as CSSMediaRule).media.mediaText);
      } else if ('selectorText' in rule) {
        const style = rule as CSSStyleRule;
        const inScope = media === undefined ? condition === null : condition?.includes(media) ?? false;
        if (inScope && selectorList(style.selectorText).includes(selector)) found.push(style.style);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules, null);
  return found;
}

/** A selector list split at its top-level commas (`:not(:disabled, [x])` stays whole). */
function selectorList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

/**
 * The declarations the document's stylesheets give one selector, for tests of CSS that jsdom cannot
 * lay out (a phone size, a reduced-motion rule). Vitest compiles every stylesheet a test imports and
 * adds it to the document (`css: true` in vite.config.ts), so a component's own rules are here once
 * the test imports the component.
 *
 * `selector` matches one selector of a rule's list exactly, as Sass writes it. Every grouping rule
 * is walked, and the conditions around a rule are joined: an @media adds its media query, an
 * @supports or @container its condition, an @layer nothing. Without `condition`, only rules with no
 * condition at all count; with it, only rules whose joined conditions contain it
 * (`'max-width: 767px'`, `'prefers-reduced-motion'`).
 */
export function cssRules(selector: string, condition?: string): CSSStyleDeclaration[] {
  const found: CSSStyleDeclaration[] = [];
  const walk = (rules: CSSRuleList, conditions: string[]) => {
    for (const rule of Array.from(rules)) {
      if ('selectorText' in rule) {
        const style = rule as CSSStyleRule;
        const inScope = condition === undefined ? conditions.length === 0 : conditions.join(' and ').includes(condition);
        if (inScope && selectorList(style.selectorText).includes(selector)) found.push(style.style);
      }
      if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules, [...conditions, ...conditionOf(rule)]);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules, []);
  return found;
}

/** What a grouping rule adds to the conditions of the rules inside it. */
function conditionOf(rule: CSSRule): string[] {
  if ('media' in rule) return [(rule as CSSMediaRule).media.mediaText];
  if ('conditionText' in rule) return [(rule as CSSConditionRule).conditionText];
  return [];
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

import type { Nodes, PhrasingContent, Root } from 'mdast';
import type { PluggableList, Processor } from 'unified';
// Loads remark-parse's typing of the processor's `micromarkExtensions` data.
import type {} from 'remark-parse';

/**
 * The Markdown a message may use: **bold**, *italics*, `inline code`, fenced code
 * blocks, and links (`[text](url)` or a bare http(s) URL). Everything else CommonMark
 * would turn into structure (lists, headings, quotes, rules, images, raw HTML,
 * indented code) stays the characters the sender typed, so "1. eggs" or "# 3" reads in
 * the thread exactly as it was written. A line break the sender typed is a line break.
 */

/** micromark constructs switched off, by construct name. */
const DISABLED_CONSTRUCTS = [
  'blockQuote',
  'codeIndented',
  'definition',
  'headingAtx',
  'htmlFlow',
  'htmlText',
  'labelStartImage',
  'list',
  'setextUnderline',
  'thematicBreak',
];

function remarkMessageSyntax(this: Processor) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push({ disable: { null: DISABLED_CONSTRUCTS } });
}

const BARE_URL = /\bhttps?:\/\/[^\s<>]+/g;

const count = (text: string, char: string) => text.split(char).length - 1;

/** A pasted URL without the sentence punctuation after it (or a ")" it never opened). */
function trimUrl(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url[end - 1];
    const kept = url.slice(0, end);
    if (`.,:;!?'"`.includes(last) || (last === ')' && count(kept, ')') > count(kept, '('))) end -= 1;
    else break;
  }
  return url.slice(0, end);
}

/** A text value as phrasing nodes: line endings become breaks, bare URLs become links. */
function phrasing(value: string, linkUrls: boolean): PhrasingContent[] {
  const nodes: PhrasingContent[] = [];
  value.split(/\r?\n/).forEach((line, index) => {
    if (index > 0) nodes.push({ type: 'break' });
    let rest = 0;
    for (const match of linkUrls ? line.matchAll(BARE_URL) : []) {
      const url = trimUrl(match[0]);
      if (/^https?:\/\/$/.test(url)) continue;
      if (match.index > rest) nodes.push({ type: 'text', value: line.slice(rest, match.index) });
      nodes.push({ type: 'link', url, children: [{ type: 'text', value: url }] });
      rest = match.index + url.length;
    }
    if (rest < line.length) nodes.push({ type: 'text', value: line.slice(rest) });
  });
  return nodes;
}

function rewriteText(node: Nodes, insideLink: boolean): void {
  if (!('children' in node)) return;
  const children: Nodes[] = [];
  for (const child of node.children) {
    if (child.type === 'text') {
      children.push(...phrasing(child.value, !insideLink));
    } else {
      rewriteText(child, insideLink || child.type === 'link');
      children.push(child);
    }
  }
  // Text only occurs among phrasing content, so the rebuilt list keeps the parent's content model.
  (node as { children: Nodes[] }).children = children;
}

function remarkMessageText() {
  return (tree: Root) => rewriteText(tree, false);
}

export const MESSAGE_REMARK_PLUGINS: PluggableList = [remarkMessageSyntax, remarkMessageText];

import { RELEASES, collectReleases, parseRelease } from '../releaseNotes';
import { APP_VERSION } from '../version';

const FILE = [
  '---', 'date: 2026-10-23', '---', '',
  '## New', '', '- **A.** one', '  wrapped', '',
  '## Improved', '- two', '',
  '## Fixed', '- three', '',
].join('\n');

it('parses a file with all three groups', () =>
  expect(parseRelease('0.91.0.md', FILE)).toEqual({
    version: '0.91.0',
    date: '2026-10-23',
    sections: [
      { kind: 'new', markdown: '- **A.** one\n  wrapped' },
      { kind: 'improved', markdown: '- two' },
      { kind: 'fixed', markdown: '- three' },
    ],
  }));
it('parses a fixes-only file', () =>
  expect(parseRelease('0.91.1.md', '---\ndate: 2026-10-28\n---\n## Fixed\n- one\n').sections).toEqual([
    { kind: 'fixed', markdown: '- one' },
  ]));
it('reads CRLF files the same', () =>
  expect(parseRelease('0.91.0.md', FILE.replaceAll('\n', '\r\n'))).toEqual(parseRelease('0.91.0.md', FILE)));
it('keeps continuations and nested lists, and reads "#" without a space as text', () =>
  expect(parseRelease('0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- #hashtag, *a* and **b**\n  a => b\n  - nested\n').sections).toEqual([
    { kind: 'new', markdown: '- #hashtag, *a* and **b**\n  a => b\n  - nested' },
  ]));
it('accepts autolinks, and "<" or "![" inside code', () =>
  expect(parseRelease('0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- see <https://x.com>\n- `a<b` and ``![x](y)``\n').sections).toEqual([
    { kind: 'new', markdown: '- see <https://x.com>\n- `a<b` and ``![x](y)``' },
  ]));

/** The message of the error `run` throws, so a test can compare all of it. */
function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected an error, but nothing was thrown');
}

it.each([
  ['v0.91.0.md', FILE, 'v0.91.0.md:1: file name must be MAJOR.MINOR.PATCH.md'],
  ['0.91.0.md', 'date: 2026-10-23\n## New\n- a', '0.91.0.md:1: the file must start with "---"'],
  ['0.91.0.md', '---\ndate: 2026-10-23\ntitle: x\n---\n## New\n- a', '0.91.0.md:3: unknown key "title"'],
  ['0.91.0.md', '---\ndate: 2026-10-23\ndate: 2026-10-24\n---\n## New\n- a', '0.91.0.md:3: "date" given twice'],
  ['0.91.0.md', '---\ndate: 2026-10-23\nhello\n---\n## New\n- a', '0.91.0.md:3: front matter lines must be "key: value"'],
  ['0.91.0.md', '---\n---\n## New\n- a', '0.91.0.md:2: missing "date"'],
  ['0.91.0.md', '---\ndate: 2026-02-30\n---\n## New\n- a', '0.91.0.md:2: "2026-02-30" is not a calendar date'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n## New\n- a', '0.91.0.md:1: front matter is not closed'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\nHello\n## New\n- a', '0.91.0.md:4: only sections after the front matter'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## Changed\n- a', '0.91.0.md:4: unexpected heading "## Changed"'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## Fixed\n- a\n## New\n- b', '0.91.0.md:6: sections must be New, Improved, Fixed, each at most once'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n\n## Fixed\n- a', '0.91.0.md:4: "## New" has no items'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n### Details', '0.91.0.md:6: unexpected heading "### Details"'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n* a', '0.91.0.md:5: only "- " list items in a section'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n1. a', '0.91.0.md:5: only "- " list items in a section'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n> a', '0.91.0.md:5: only "- " list items in a section'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n  a', '0.91.0.md:5: only "- " list items in a section'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- ', '0.91.0.md:5: an item needs its text right after "- "'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- # Big', '0.91.0.md:5: no headings inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n  ## Sub', '0.91.0.md:6: no headings inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- > q', '0.91.0.md:5: no block quotes inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n  | b | c |', '0.91.0.md:6: no tables inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n  b | c\n  --- | ---', '0.91.0.md:7: no tables inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n  ```\n  b\n  ```', '0.91.0.md:6: no code blocks inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n  ~~~', '0.91.0.md:6: no code blocks inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n\n      code', '0.91.0.md:7: no indented code blocks inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n\n  \t\tcode', '0.91.0.md:7: no indented code blocks inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- ---', '0.91.0.md:5: no horizontal rules or underlined headings inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n  ---', '0.91.0.md:6: no horizontal rules or underlined headings inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n  =', '0.91.0.md:6: no horizontal rules or underlined headings inside an item'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- see ![x](y.png)', '0.91.0.md:5: no images'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- <b>a</b>', '0.91.0.md:5: no HTML'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- `<b>` and <https://x.com>, then <i>x</i>', '0.91.0.md:5: no HTML'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n', '0.91.0.md:3: no sections'],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---', '0.91.0.md:3: no sections'],
])('refuses %s: %j', (name, text, message) => expect(thrownMessage(() => parseRelease(name, text))).toBe(message));

it('sorts newest first', () =>
  expect(
    collectReleases({
      './notes/0.91.0.md': '---\ndate: 2026-10-23\n---\n## New\n- a',
      './notes/0.92.0.md': '---\ndate: 2026-11-05\n---\n## New\n- b',
    }).map((r) => r.version),
  ).toEqual(['0.92.0', '0.91.0']));
it('refuses a higher version with an earlier date, at its date line', () =>
  expect(
    thrownMessage(() =>
      collectReleases({
        './notes/0.91.0.md': '---\ndate: 2026-10-23\n---\n## New\n- a',
        './notes/0.92.0.md': '---\ndate: 2026-10-01\n---\n## New\n- b',
      }),
    ),
  ).toBe("0.92.0.md:2: date 2026-10-01 is earlier than 0.91.0.md's 2026-10-23; a higher version needs the same date or a later one"));
it('refuses one version from two files', () =>
  expect(() =>
    collectReleases({
      './notes/0.91.0.md': '---\ndate: 2026-10-23\n---\n## New\n- a',
      './old/0.91.0.md': '---\ndate: 2026-10-23\n---\n## New\n- b',
    }),
  ).toThrow('./old/0.91.0.md:1: version 0.91.0 is also in ./notes/0.91.0.md'));

describe('the notes folder', () => {
  it('parses, and its newest release is the app version', () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    expect(RELEASES[0].version).toBe(APP_VERSION);
  });
});

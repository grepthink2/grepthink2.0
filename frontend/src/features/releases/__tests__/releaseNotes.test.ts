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

it.each([
  ['v0.91.0.md', FILE, /^v0\.91\.0\.md:1: file name must be MAJOR\.MINOR\.PATCH\.md$/],
  ['0.91.0.md', 'date: 2026-10-23\n## New\n- a', /:1: /],
  ['0.91.0.md', '---\ndate: 2026-10-23\ntitle: x\n---\n## New\n- a', /:3: unknown key "title"$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\ndate: 2026-10-24\n---\n## New\n- a', /:3: "date" given twice$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\nhello\n---\n## New\n- a', /:3: front matter lines must be "key: value"$/],
  ['0.91.0.md', '---\n---\n## New\n- a', /:1: missing "date"$/],
  ['0.91.0.md', '---\ndate: 2026-02-30\n---\n## New\n- a', /:2: "2026-02-30" is not a calendar date$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n## New\n- a', /:1: front matter is not closed$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\nHello\n## New\n- a', /:4: only sections after the front matter$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## Changed\n- a', /:4: unexpected heading "## Changed"$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## Fixed\n- a\n## New\n- b', /:6: sections must be New, Improved, Fixed, each at most once$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n\n## Fixed\n- a', /:4: "## New" has no items$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- a\n### Details', /:6: unexpected heading "### Details"$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n* a', /:5: only "- " list items in a section$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n1. a', /:5: only "- " list items in a section$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n> a', /:5: only "- " list items in a section$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n  a', /:5: only "- " list items in a section$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- see ![x](y.png)', /:5: no images$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n## New\n- <b>a</b>', /:5: no HTML$/],
  ['0.91.0.md', '---\ndate: 2026-10-23\n---\n', /:1: no sections$/],
])('refuses %s: %j', (name, text, message) => expect(() => parseRelease(name, text)).toThrow(message));

it('sorts newest first', () =>
  expect(
    collectReleases({
      './notes/0.91.0.md': '---\ndate: 2026-10-23\n---\n## New\n- a',
      './notes/0.92.0.md': '---\ndate: 2026-11-05\n---\n## New\n- b',
    }).map((r) => r.version),
  ).toEqual(['0.92.0', '0.91.0']));
it('refuses a higher version with an earlier date', () =>
  expect(() =>
    collectReleases({
      './notes/0.91.0.md': '---\ndate: 2026-10-23\n---\n## New\n- a',
      './notes/0.92.0.md': '---\ndate: 2026-10-01\n---\n## New\n- b',
    }),
  ).toThrow(/0\.92\.0\.md.*0\.91\.0\.md|0\.91\.0\.md.*0\.92\.0\.md/));
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

// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OWNERSHIP_ALLOWLIST,
  checkMarkup,
  checkStylesheet,
  compileScss,
  firstCompoundClasses,
  ownedClasses,
  selectorsOf,
  splitCodeAndComments,
} from '../ownership.mjs';

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));
const featureScss = fileURLToPath(new URL('./fixtures/feature.scss', import.meta.url));
const owned = new Map([
  ['gt-button', 'Button'],
  ['gt-button--sm', 'Button'],
]);
const kit = new Map([
  ['gt-tooltip', 'Tooltip'],
  ['gt-toast', 'Toast'],
]);

describe('firstCompoundClasses', () => {
  it('reads the classes of the first compound selector only', () => {
    expect(firstCompoundClasses('.gt-tm__head .gt-button')).toEqual(['gt-tm__head']);
    expect(firstCompoundClasses('.gt-button.feature')).toEqual(['gt-button', 'feature']);
    expect(firstCompoundClasses('button.gt-button > .gt-button__icon')).toEqual(['gt-button']);
    expect(firstCompoundClasses('.a>.b')).toEqual(['a']);
    expect(firstCompoundClasses('.a+.b')).toEqual(['a']);
    expect(firstCompoundClasses('.a~.b')).toEqual(['a']);
  });

  it('ignores classes inside parenthesised pseudo-class arguments', () => {
    expect(firstCompoundClasses('.gt-button--sm:hover:not(:disabled)')).toEqual(['gt-button--sm']);
    expect(firstCompoundClasses('.a:not(.gt-button) > .b')).toEqual(['a']);
    expect(firstCompoundClasses(':is(.gt-button, .x) .y')).toEqual([]);
    expect(firstCompoundClasses('.a:has(> .gt-button + .b)')).toEqual(['a']);
    expect(firstCompoundClasses('li:nth-child(2n + 1 of .gt-button)')).toEqual([]);
  });

  it('ignores dots inside attribute selectors', () => {
    expect(firstCompoundClasses('a[href$=".pdf"].link')).toEqual(['link']);
    expect(firstCompoundClasses('[data-x="a b"] .c')).toEqual([]);
  });
});

describe('selectorsOf', () => {
  it('lists the selectors of every style rule, inside @media, @supports and the like too', () => {
    const css = [
      '@charset "UTF-8";',
      '@layer base, components;',
      '/* .gt-button { a comment } */',
      '.a, .b:is(.c, .d) { color: red; }',
      '@media (max-width: 767px) { .e { color: blue; } }',
      '@supports (display: grid) { @media print { .f { display: grid; } } }',
      '@container (min-width: 400px) { .g { color: red; } }',
      '@layer base { .h { color: red; } }',
      '@keyframes spin { from { opacity: 0; } to { opacity: 1; } }',
      '@font-face { font-family: X; src: url(x.woff2); }',
      '.i::before { content: "} .j {"; }',
    ].join('\n');
    expect(selectorsOf(css)).toEqual(['.a', '.b:is(.c, .d)', '.e', '.f', '.g', '.h', '.i::before']);
  });

  it('reads a selector list split over lines as one selector per entry', () => {
    expect(selectorsOf('.a,\n.b .c,\n.d > .e {\n  color: red;\n}')).toEqual(['.a', '.b .c', '.d > .e']);
  });
});

describe('ownedClasses', () => {
  it('maps the first-compound classes of each component stylesheet to its folder', () => {
    const map = ownedClasses(
      new Map([
        ['Button', '.gt-button { } .gt-button--sm:hover { } .gt-button .gt-button__icon { }'],
        ['Menu', '.gt-menu__item:hover { } @media print { .gt-menu { } }'],
      ]),
    );
    expect(map).toEqual(
      new Map([
        ['gt-button', 'Button'],
        ['gt-button--sm', 'Button'],
        ['gt-menu__item', 'Menu'],
        ['gt-menu', 'Menu'],
      ]),
    );
  });

  it("owns the classes of the component's own blocks, not those of an outer context", () => {
    const map = ownedClasses(
      new Map([
        ['Toast', '.gt-toast-stack { } .app-view--previewing .gt-toast-stack { }'],
        ['Field', '.gt-field { } .gt-field--error .gt-input { }'],
        ['Markdown', '.gt-md { } .gt-md .sr-only { }'],
      ]),
    );
    expect(map.has('app-view--previewing')).toBe(false);
    expect(map.get('gt-toast-stack')).toBe('Toast');
    expect(map.get('gt-field--error')).toBe('Field');
    expect(map.has('sr-only')).toBe(false);
  });
});

describe('checkStylesheet', () => {
  it('flags a rule whose first compound begins with an owned class', () => {
    expect(checkStylesheet('f.scss', '.gt-button { color: red }', owned)).toHaveLength(1);
    expect(
      checkStylesheet('f.scss', '@media (max-width: 767px) { .gt-button--sm { min-height: 44px } }', owned),
    ).toHaveLength(1);
    expect(checkStylesheet('f.scss', '.gt-button.feature { margin: 0 }', owned)).toHaveLength(1);
    expect(checkStylesheet('f.scss', 'button.gt-button { margin: 0 }', owned)).toHaveLength(1);
  });

  it("passes a rule that adjusts the component from the feature's own class", () => {
    expect(checkStylesheet('f.scss', '.gt-tm__head .gt-button { flex-shrink: 0 }', owned)).toEqual([]);
    expect(checkStylesheet('f.scss', '.feature.gt-button { margin: 0 }', owned)).toEqual([]);
    expect(checkStylesheet('f.scss', '.feature:not(.gt-button) { margin: 0 }', owned)).toEqual([]);
  });

  it.each([
    'body .gt-button',
    ':root .gt-button',
    '* > .gt-button',
    ':where(.gt-button)',
    ':not(.feature) .gt-button',
  ])('flags %s: a context with no class of its own is the whole page, not the feature', (selector) => {
    expect(checkStylesheet('f.scss', `${selector} { margin: 0 }`, owned)).toEqual([
      { file: 'f.scss', selector, cls: 'gt-button', owner: 'Button' },
    ]);
  });

  it.each([
    '.feature .gt-button',
    'body .feature .gt-button',
    '.feature:not(.gt-button)',
    ':is(.feature) .gt-button',
  ])("passes %s: the rule starts from the feature's own class", (selector) => {
    expect(checkStylesheet('f.scss', `${selector} { margin: 0 }`, owned)).toEqual([]);
  });

  it('reports the file, the selector, the class and its owner', () => {
    expect(checkStylesheet('f.scss', '.x, .gt-button--sm:hover { color: red }', owned)).toEqual([
      { file: 'f.scss', selector: '.gt-button--sm:hover', cls: 'gt-button--sm', owner: 'Button' },
    ]);
  });

  it('checks the rules as Sass resolves the nesting', () => {
    const css = compileScss(featureScss, srcDir);
    expect(checkStylesheet('feature.scss', css, owned).map((v) => v.selector)).toEqual([
      '.gt-button--sm',
      '.gt-button--sm',
    ]);
  });

  it('skips a class the allowlist names for that file', () => {
    const allowlist = [{ file: 'f.scss', cls: 'gt-button', reason: 'a test' }];
    expect(checkStylesheet('f.scss', '.gt-button { color: red }', owned, allowlist)).toEqual([]);
    expect(checkStylesheet('g.scss', '.gt-button { color: red }', owned, allowlist)).toHaveLength(1);
  });
});

describe('checkMarkup', () => {
  it('flags an owned class written as a whole token in a string or template literal', () => {
    expect(checkMarkup('f.tsx', 'className="gt-button gt-button--sm"', owned)[0].cls).toBe('gt-button');
    expect(checkMarkup('f.tsx', 'className="gt-tm__btn fr-skeleton"', owned)).toEqual([]);
    expect(checkMarkup('f.tsx', 'className={`gt-button--${size}`}', owned)).toEqual([]); // a partial token is not a class
    expect(checkMarkup('f.tsx', 'className={`gt-button gt-button--${size}`}', owned)).toHaveLength(1);
  });

  it('flags an owned class glued to an interpolation by the text before the interpolation', () => {
    expect(checkMarkup('f.tsx', "className={`gt-button${busy ? ' is-busy' : ''}`}", owned)).toEqual([
      { file: 'f.tsx', line: 1, cls: 'gt-button', owner: 'Button' },
    ]);
    expect(checkMarkup('f.tsx', 'className={`gt-button${x}`}', owned)).toHaveLength(1);
    expect(checkMarkup('f.tsx', 'className={`gt-button--${size}`}', owned)).toEqual([]);
    expect(checkMarkup('f.tsx', 'className={`${prefix}gt-button`}', owned)).toEqual([]);
  });

  it('reports the line of each class', () => {
    const source = ['const a = 1;', '<button className="gt-button gt-button--sm">Save</button>'].join('\n');
    expect(checkMarkup('f.tsx', source, owned)).toEqual([
      { file: 'f.tsx', line: 2, cls: 'gt-button', owner: 'Button' },
      { file: 'f.tsx', line: 2, cls: 'gt-button--sm', owner: 'Button' },
    ]);
    const template = ['<div', '  className={`', '    row', '    gt-button', '  `}', '/>'].join('\n');
    expect(checkMarkup('f.tsx', template, owned)).toEqual([
      { file: 'f.tsx', line: 4, cls: 'gt-button', owner: 'Button' },
    ]);
  });

  it('ignores comments', () => {
    const source = [
      '// renders "gt-button" by hand',
      '/* className="gt-button" */',
      '<p>{/* "gt-button" */}</p>',
    ].join('\n');
    expect(checkMarkup('f.tsx', source, owned)).toEqual([]);
  });

  it('finds a class in a string inside a template interpolation, and no identifier there', () => {
    expect(checkMarkup('f.tsx', "className={`row ${busy ? 'gt-button' : ''}`}", owned)).toEqual([
      { file: 'f.tsx', line: 1, cls: 'gt-button', owner: 'Button' },
    ]);
    const skeleton = new Map([['skeleton', 'Skeleton']]);
    expect(checkMarkup('f.tsx', 'const label = `${skeleton} ${ loading ? skeleton : list }`;', skeleton)).toEqual(
      [],
    );
  });

  it('reads an apostrophe in JSX text as text, not as the start of a string', () => {
    const source = ['<p>', `  Don't wait: <b className="gt-button">now</b>`, '</p>'].join('\n');
    expect(checkMarkup('f.tsx', source, owned)).toEqual([
      { file: 'f.tsx', line: 2, cls: 'gt-button', owner: 'Button' },
    ]);
  });

  it('ends a quote that never closes at the end of its line', () => {
    const source = ["<p>'90s music</p>", '<b className="gt-button" />'].join('\n');
    expect(checkMarkup('f.tsx', source, owned)).toEqual([
      { file: 'f.tsx', line: 2, cls: 'gt-button', owner: 'Button' },
    ]);
  });

  it('reads a possessive after a JSX expression or tag as text, not as the start of a string', () => {
    expect(checkMarkup('f.tsx', `<p>{user.name}'s team <span className="gt-tooltip">`, kit)).toEqual([
      { file: 'f.tsx', line: 1, cls: 'gt-tooltip', owner: 'Tooltip' },
    ]);
    expect(checkMarkup('f.tsx', `<b>{name}</b>'s project <i className="gt-toast" />`, kit)).toEqual([
      { file: 'f.tsx', line: 1, cls: 'gt-toast', owner: 'Toast' },
    ]);
    expect(checkMarkup('f.tsx', `const label = () =>'gt-toast';`, kit)).toHaveLength(1);
  });

  it('opens a template only where an expression can start, or right after its tag', () => {
    const kbd = ['<p>Press <kbd>`</kbd> to open the console.</p>', '<i className="gt-toast" />'].join('\n');
    expect(checkMarkup('f.tsx', kbd, kit)).toEqual([{ file: 'f.tsx', line: 2, cls: 'gt-toast', owner: 'Toast' }]);
    const backticked = ['<p>**bold** · `code` · lists</p>', '<i className="gt-toast" />'].join('\n');
    expect(checkMarkup('f.tsx', backticked, kit)).toEqual([
      { file: 'f.tsx', line: 2, cls: 'gt-toast', owner: 'Toast' },
    ]);
    expect(checkMarkup('f.ts', "const s = css`a ${'gt-toast'}`;", kit)).toHaveLength(1);
    expect(checkMarkup('f.ts', 'const s = styled.div`gt-toast`;', kit)).toHaveLength(1);
  });

  it('reads a slash whose closing slash is followed by a letter that is no flag as text', () => {
    expect(checkMarkup('f.tsx', '<p>Log in/out <b className="gt-toast">x</b></p>', kit)).toEqual([
      { file: 'f.tsx', line: 1, cls: 'gt-toast', owner: 'Toast' },
    ]);
    expect(checkMarkup('f.ts', "const ok = /in/gu.test(s) ? 'gt-toast' : '';", kit)).toHaveLength(1);
  });

  it("reads a regular expression's quotes as part of it, and a JSX slash as no regular expression", () => {
    const csv = [
      'const cell = /[",\\n]/.test(s) ? `"${s.replace(/"/g, \'""\')}"` : s;',
      'const c = "gt-button";',
    ].join('\n');
    expect(checkMarkup('f.ts', csv, owned)).toEqual([{ file: 'f.ts', line: 2, cls: 'gt-button', owner: 'Button' }]);
    expect(checkMarkup('f.tsx', '<p>{a}</p><i className="gt-button" />', owned)).toHaveLength(1);
    expect(checkMarkup('f.tsx', '{done}/{total} <i className="gt-button" />', owned)).toHaveLength(1);
  });

  it('skips a class the allowlist names for that file', () => {
    const allowlist = [{ file: 'f.tsx', cls: 'gt-button', reason: 'a test' }];
    expect(
      checkMarkup('f.tsx', 'className="gt-button gt-button--sm"', owned, allowlist).map((v) => v.cls),
    ).toEqual(['gt-button--sm']);
  });
});

describe('splitCodeAndComments', () => {
  it('keeps the layout of the code, collects the comments and lists the literals', () => {
    const source = ["const a = 'x'; // note", '/* block', '   #fff */ const b = `y ${a} z`;'].join('\n');
    const { code, comments, literals } = splitCodeAndComments(source);
    expect(code).toHaveLength(source.length);
    expect(code.split('\n')).toHaveLength(3);
    expect(code).not.toContain('note');
    expect(code).not.toContain('#fff');
    expect(comments).toContain('// note');
    expect(comments).toContain('#fff');
    expect(literals.map((l) => source.slice(l.start, l.start + l.text.length))).toEqual(['x', 'y ${a} z']);
  });

  it('reads a regular expression literal as code only in a script', () => {
    const source = 'const re = /[\'"]/g; const s = \'x\';';
    expect(splitCodeAndComments(source, { script: true }).literals.map((l) => l.text)).toEqual(['x']);
    expect(splitCodeAndComments(source).literals.map((l) => l.text)).not.toEqual(['x']);
  });
});

describe('compileScss', () => {
  it('resolves the Vite path aliases', () => {
    const css = compileScss(featureScss, srcDir);
    expect(css).toContain('animation: gt-spin'); // @styles/motion
    expect(css).toContain('animation: skeleton-shimmer'); // @/styles/skeleton
  });
});

describe('OWNERSHIP_ALLOWLIST', () => {
  it('gives every entry a file, a class and a reason', () => {
    for (const entry of OWNERSHIP_ALLOWLIST) {
      expect(entry.file).toMatch(/^src\//);
      expect(entry.cls).toMatch(/^[\w-]+$/);
      expect(entry.reason).toBeTruthy();
    }
  });
});

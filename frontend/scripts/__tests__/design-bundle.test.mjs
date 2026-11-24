// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { BUNDLE_JS_CAP, buildBundle, finishBundleJs, loadInJsdom, parseBundleHeader } from '../design-system/bundle.mjs';
import { NAMESPACE, collectKitExports } from '../design-system/exports.mjs';
import { buildPreviews, checkPreview, kitCards } from '../design-system/previews.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

const exports = [
  { name: 'useThing', kind: 'hook' },
  { name: 'Button', kind: 'component' },
  { name: 'shade', kind: 'helper' },
  { name: 'CardGroup', kind: 'component' },
  { name: 'Card', kind: 'component' },
  { name: 'Button', kind: 'component' },
];
const cards = ['Card', 'Button'];

describe('finishBundleJs', () => {
  it('puts the header on line 1, naming the cards in export order, each once', () => {
    const out = finishBundleJs('(function(){})();\n', exports, cards);
    const [line1, ...rest] = out.split('\n');
    expect(line1).toMatch(/^\/\* @ds-bundle: \{.*\} \*\/$/);
    expect(parseBundleHeader(out)).toEqual({
      format: 4,
      namespace: NAMESPACE,
      components: [{ name: 'Button' }, { name: 'Card' }],
    });
    expect(rest.join('\n')).toBe('(function(){})();\n');
  });

  it('refuses a card that names no export', () => {
    expect(() => finishBundleJs('(function(){})();\n', exports, ['Button', 'Combobox'])).toThrow('a card names no bundle export: Combobox');
  });

  it('escapes the strings that would end or confuse an inline script, and passes its own check', () => {
    const out = finishBundleJs('var a="a</script>b",b="x<!--y";\n', exports, cards);
    expect(out).toContain('var a="a<\\/script>b",b="x<\\!--y";');
    expect(out).not.toContain('</script');
    expect(out).not.toContain('<!--');
    expect(() => finishBundleJs(out.split('\n').slice(1).join('\n'), exports, cards)).not.toThrow();
  });

  it('refuses a bundle over 6 MB', () => {
    expect(() => finishBundleJs('x'.repeat(BUNDLE_JS_CAP + 1), exports, cards)).toThrow('bundle.js is over 6 MB');
  });

  it('refuses a module statement', () => {
    expect(() => finishBundleJs("import { a } from 'b';\na();\n", exports, cards)).toThrow('bundle.js has a top-level import or export');
    expect(() => finishBundleJs('export default 1;\n', exports, cards)).toThrow('bundle.js has a top-level import or export');
    expect(() => finishBundleJs('var m=import.meta;import("x");\n', exports, cards)).not.toThrow();
  });
});

const lib = (file) => readFileSync(`${root}node_modules/${file}`, 'utf8');

describe('built bundle', () => {
  let built;
  let finished;
  let window;

  let cardNames;

  beforeAll(async () => {
    built = await buildBundle({ root });
    const withIcon = [...collectKitExports(`${root}src/components`), { name: 'Icon' }];
    cardNames = kitCards(root, withIcon).map((card) => card.component);
    finished = finishBundleJs(built.js, built.exports, cardNames);
    window = loadInJsdom([
      lib('react18/umd/react.production.min.js'),
      lib('react-dom18/umd/react-dom.production.min.js'),
      finished,
    ]);
  }, 120_000);

  it('puts every export on the namespace, and names only the cards in the header', () => {
    const header = parseBundleHeader(finished);
    expect(header.components.map((c) => c.name).sort()).toEqual([...cardNames].sort());
    expect(header.components.length).toBeGreaterThan(40);
    const namespace = window[NAMESPACE];
    expect(Object.keys(namespace).sort()).toEqual([...new Set(built.exports.map((e) => e.name))].sort());
    for (const name of ['MenuItem', 'TabPanel', 'useDialog', 'hashColor']) {
      expect(name in namespace).toBe(true);
      expect(header.components.some((c) => c.name === name)).toBe(false);
    }
  });

  /** Renders `element` into a fresh container, synchronously, and returns the container. */
  function mount(element) {
    const { React, ReactDOM, document } = window;
    const container = document.createElement('div');
    document.body.append(container);
    const root = ReactDOM.createRoot(container);
    ReactDOM.flushSync(() => root.render(element));
    return { container, React, unmount: () => ReactDOM.flushSync(() => root.unmount()) };
  }

  it('hands a ref given by the page to the element a component renders', () => {
    const { React } = window;
    const ref = React.createRef();
    const { container } = mount(React.createElement(window[NAMESPACE].Button, { ref }, 'Save'));
    expect(ref.current).toBe(container.querySelector('button'));
  });

  it('renders a router link as a plain anchor', () => {
    const { React } = window;
    const { container } = mount(React.createElement(window[NAMESPACE].Button, { to: '/x' }, 'Open'));
    expect(container.querySelector('a[href="/x"]')).not.toBeNull();
  });

  it('places an icon by name', () => {
    const { React } = window;
    const { container } = mount(React.createElement(window[NAMESPACE].Icon, { name: 'Trash2' }));
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('carries neither the router nor a second React', () => {
    expect(finished).not.toContain('createBrowserRouter');
    expect(finished).not.toContain('react.production');
    expect(finished).not.toContain('react-dom.production');
  });

  it('emits the kit stylesheet', () => {
    expect(built.css).toContain('.gt-button');
  });

  // Built in this file, after the bundle: the two builds share .design-system/, so a test file of
  // their own would run them side by side in another worker.
  describe('the previews, compiled against it', () => {
    let previews;
    const libs = [lib('react18/umd/react.production.min.js'), lib('react-dom18/umd/react-dom.production.min.js')];
    const tokensJson = JSON.stringify({ color: { tokens: [] }, type: { fonts: [], families: {}, groups: [] } });

    beforeAll(async () => {
      previews = await buildPreviews({ root, exports: collectKitExports(`${root}src/components`) });
    }, 120_000);

    it('compiles each preview into a document that renders on React 18 against the built bundle', async () => {
      const names = previews.map((preview) => preview.component);
      for (const name of ['Button', 'Modal', 'MarkdownText', 'Icon']) expect(names).toContain(name);
      for (const { component, html, meta } of previews.filter((p) => ['Button', 'Modal', 'MarkdownText'].includes(p.component))) {
        const problems = await checkPreview({ html, libs, bundleJs: finished, bundleCss: built.css, tokensJson, expects: meta.expects });
        expect({ component, problems }).toEqual({ component, problems: [] });
      }
    }, 60_000);

    it("reads the kit from the bundle's namespace instead of carrying its source", () => {
      const button = previews.find((preview) => preview.component === 'Button').html;
      expect(button).not.toContain('gt-button__faces');
      expect(finished).toContain('gt-button__faces');
      expect(button).toContain(NAMESPACE);
    });
  });
});

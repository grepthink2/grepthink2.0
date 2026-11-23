/**
 * `npm run design:check`: whether the tree `npm run design:build` wrote (.design-system/project/)
 * can be published to the Design System artifact. checkTree returns the problems, none when it
 * can; run as a script, it prints them and exits 1 if there are any.
 *
 * Checked: the files the build owns are there and the page's own files are not (tokens.css,
 * manifest.json, api/); the size caps and the text an inline script or style must not hold; the
 * bundle header, and every name in it on the namespace once React 18 and the bundle have run in
 * jsdom; tokens.json's shape, names and colour values; every token of the token stylesheets either
 * in tokens.json or still declared in bundle.css; every rule of the kit's compiled CSS inside the
 * base layer's scope; the icon list built in equal to the lucide icons src/ imports now; for every
 * preview the kit carries (previews.mjs), its `components/<Name>/preview.html`, rendered on React 18
 * against the built bundle by checkPreview, and its `components/<Name>/README.md`, within the
 * guide's size; and no folder under components/ but lib/ and the bundle's exports.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstCompoundClasses, selectorsOf } from '../ownership.mjs';
import { bundleJsProblems, loadInJsdom, parseBundleHeader } from './bundle.mjs';
import { NAMESPACE } from './exports.mjs';
import { collectLucideIcons } from './icons.mjs';
import { GUIDE_CAP } from './guides.mjs';
import { checkPreview, collectPreviews, iconPreview } from './previews.mjs';
import { BUNDLE_CSS_CAP, topLevelBlocks } from './styles.mjs';
import { TOKEN_NAME, parseTokenCss } from './tokens.mjs';

const FRONTEND = fileURLToPath(new URL('../../', import.meta.url));

export const LIBRARIES = ['components/lib/react.production.min.js', 'components/lib/react-dom.production.min.js'];
export const REQUIRED = ['tokens.json', 'components/bundle.js', 'components/bundle.css', 'components/index.d.ts', ...LIBRARIES];
const PAGE_FILES = ['tokens.css', 'manifest.json', 'api'];
const LIBRARY_CAP = 2 * 1024 * 1024;
const COLOUR_CAP = 600;
const FAMILY_CAP = 60;
const FAMILIES_CAP = 12;
const TYPE_STYLES_CAP = 80;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCTION = /^(?:rgba?|hsla?|oklch)\(\s*[-\d.%\s,/]+\)$/i;
const ALIAS = /^\{(.+)\}$/;

const read = (dir, path) => readFileSync(join(dir, path), 'utf8');

function tokensProblems(tokens) {
  const problems = [];
  const families = Object.keys(tokens).filter((key) => !['name', 'version', 'meta'].includes(key));
  if (families.length > FAMILIES_CAP) problems.push(`tokens.json has ${families.length} families; the format allows ${FAMILIES_CAP}`);
  const seen = new Set();
  const colours = new Set();
  for (const family of families) {
    if (family === 'type') {
      const type = tokens.type;
      if (!Array.isArray(type?.fonts)) problems.push('tokens.json: type.fonts is not a list');
      if (!Array.isArray(type?.groups)) problems.push('tokens.json: type.groups is not a list');
      const styles = (type?.groups ?? []).flatMap((group) => group.styles ?? []);
      if (styles.length > TYPE_STYLES_CAP) problems.push(`tokens.json has ${styles.length} type styles; the format allows ${TYPE_STYLES_CAP}`);
      continue;
    }
    const list = tokens[family]?.tokens;
    if (!Array.isArray(list)) {
      problems.push(`tokens.json: ${family}.tokens is not a list`);
      continue;
    }
    if (family === 'color') {
      if (!Array.isArray(tokens.color.themes)) problems.push('tokens.json: color.themes is not a list');
      if (list.length > COLOUR_CAP) problems.push(`tokens.json has ${list.length} colours; the format allows ${COLOUR_CAP}`);
    } else if (list.length > FAMILY_CAP) {
      problems.push(`tokens.json: ${family} has ${list.length} tokens; the format allows ${FAMILY_CAP}`);
    }
    for (const { name } of list) {
      if (typeof name !== 'string' || !TOKEN_NAME.test(name)) problems.push(`tokens.json: ${JSON.stringify(name)} is not a valid token name`);
      else if (seen.has(name)) problems.push(`tokens.json: ${name} appears twice`);
      seen.add(name);
      if (family === 'color') colours.add(name);
    }
  }
  for (const { name, value } of Array.isArray(tokens.color?.tokens) ? tokens.color.tokens : []) {
    const alias = ALIAS.exec(String(value));
    if (alias) {
      if (!colours.has(alias[1])) problems.push(`tokens.json: colour ${name} aliases ${alias[1]}, which is not a colour token`);
    } else if (!HEX.test(String(value)) && !COLOR_FUNCTION.test(String(value))) {
      problems.push(`tokens.json: colour ${name} has value ${JSON.stringify(value)}, which the format does not accept`);
    }
  }
  return problems;
}

// The names tokens.json carries, in any family but type.
function tokenNamesOf(tokens) {
  return new Set(
    Object.entries(tokens)
      .filter(([key, family]) => key !== 'type' && Array.isArray(family?.tokens))
      .flatMap(([, family]) => family.tokens.map((token) => token.name)),
  );
}

// The base layer's scope tests, read back from its box-sizing rule.
function baseLayerScope(css) {
  const rule = topLevelBlocks(css).find((block) => /box-sizing:\s*border-box/.test(css.slice(block.open, block.close)) && block.prelude.startsWith(':where('));
  if (!rule) return null;
  const inner = /^:where\(([^)]*(?:\([^)]*\)[^)]*)*)\)/.exec(rule.prelude)?.[1];
  if (!inner) return null;
  return inner.split(',').map((test) => test.trim());
}

function inScope(cls, scope) {
  return scope.some((test) => {
    const prefix = /^\[class[\^*]="\s?([^"]*)"\]$/.exec(test)?.[1];
    if (prefix !== undefined) return cls.startsWith(prefix);
    return test === `.${cls}`;
  });
}

function filesUnder(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/**
 * @param {string} dir the tree to publish (.design-system/project)
 * @param {{ srcDir?: string; reportFile?: string; runtimeDir?: string }} [options] the app's src/
 *   (token stylesheets, lucide imports, the kit's previews), the build report beside the tree (its
 *   icon list), and the design-system runtime (Icon's preview)
 * @returns {Promise<string[]>} the problems, empty when the tree is publishable
 */
export async function checkTree(
  dir,
  { srcDir = join(FRONTEND, 'src'), reportFile = join(dir, '..', 'report.json'), runtimeDir = join(FRONTEND, 'design-system/runtime') } = {},
) {
  const problems = [];
  for (const path of REQUIRED) if (!existsSync(join(dir, path))) problems.push(`missing ${path}`);
  for (const path of PAGE_FILES) {
    if (existsSync(join(dir, path))) problems.push(`${path} is the page's to generate; the build must not write it`);
  }
  if (problems.length) return problems;

  const bundle = read(dir, 'components/bundle.js');
  const css = read(dir, 'components/bundle.css');
  problems.push(...bundleJsProblems(bundle));
  if (Buffer.byteLength(css) > BUNDLE_CSS_CAP) problems.push('bundle.css is over 2 MB');
  if (css.includes('</style')) problems.push('bundle.css contains </style');
  for (const path of filesUnder(join(dir, 'components/lib'))) {
    const name = relative(dir, path).split(sep).join('/');
    if (statSync(path).size > LIBRARY_CAP) problems.push(`${name} is over 2 MB`);
  }

  const header = parseBundleHeader(bundle);
  // Previews are rendered only against a bundle that loads and holds every name in its header.
  let bundleLoads = false;
  if (!header) {
    problems.push('bundle.js has no @ds-bundle header on line 1');
  } else if (header.namespace !== NAMESPACE) {
    problems.push(`bundle.js header names namespace ${header.namespace}, not ${NAMESPACE}`);
  } else {
    const before = problems.length;
    try {
      const window = loadInJsdom([...LIBRARIES.map((path) => read(dir, path)), bundle]);
      const namespace = window[NAMESPACE];
      for (const { name } of header.components ?? []) {
        if (!namespace || !(name in namespace)) problems.push(`${name} is in the bundle header but not on window.${NAMESPACE}`);
      }
      const errors = namespace?.__errors;
      if (errors && Object.keys(errors).length) problems.push(`window.${NAMESPACE}.__errors is not empty: ${JSON.stringify(errors)}`);
      bundleLoads = problems.length === before;
      window.close();
    } catch (error) {
      problems.push(`bundle.js does not load after React 18: ${error.message}`);
    }
  }

  let tokens;
  try {
    tokens = JSON.parse(read(dir, 'tokens.json'));
  } catch {
    problems.push('tokens.json is not valid JSON');
  }
  if (tokens) {
    problems.push(...tokensProblems(tokens));
    const carried = tokenNamesOf(tokens);
    const declared = new Set(parseTokenCss(css).map((token) => token.name));
    const tokensDir = join(srcDir, 'styles/tokens');
    for (const file of readdirSync(tokensDir).filter((f) => f.endsWith('.css')).sort()) {
      for (const { name } of parseTokenCss(readFileSync(join(tokensDir, file), 'utf8'))) {
        if (!carried.has(name) && !declared.has(name)) {
          problems.push(`--${name} (styles/tokens/${file}) is neither in tokens.json nor declared in bundle.css`);
        }
      }
    }
  }

  const scope = baseLayerScope(css);
  if (!scope) {
    problems.push('bundle.css has no base layer');
  } else {
    const outside = new Set();
    for (const selector of selectorsOf(css)) {
      const [cls] = firstCompoundClasses(selector);
      if (cls && !inScope(cls, scope)) outside.add(cls);
    }
    for (const cls of outside) problems.push(`bundle.css: .${cls} is outside the base layer's scope`);
  }

  if (!existsSync(reportFile)) {
    problems.push(`missing ${relative(dirname(dir), reportFile).split(sep).join('/')}`);
  } else {
    const built = JSON.parse(readFileSync(reportFile, 'utf8')).icons ?? [];
    const now = collectLucideIcons(srcDir);
    const missing = now.filter((name) => !built.includes(name));
    const extra = built.filter((name) => !now.includes(name));
    if (missing.length || extra.length) {
      problems.push(
        `the icons built in differ from those src/ imports: ${[
          missing.length ? `missing ${missing.join(', ')}` : '',
          extra.length ? `no longer imported ${extra.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('; ')}`,
      );
    }
  }

  if (header) {
    const names = new Set((header.components ?? []).map((component) => component.name));
    for (const entry of readdirSync(join(dir, 'components')).sort()) {
      if (entry === 'lib' || names.has(entry) || !statSync(join(dir, 'components', entry)).isDirectory()) continue;
      problems.push(`components/${entry}/ is not a bundle export`);
    }
  }
  if (bundleLoads) problems.push(...(await previewProblems(dir, { header, bundle, css, tokens: tokens ?? {}, srcDir, runtimeDir })));
  return problems;
}

// Every preview the kit carries, built into the tree and rendered against the built bundle.
async function previewProblems(dir, { header, bundle, css, tokens, srcDir, runtimeDir }) {
  const exports = header.components ?? [];
  const componentsDir = join(srcDir, 'components');
  let previews;
  try {
    previews = [...(existsSync(componentsDir) ? collectPreviews(componentsDir, exports) : []), iconPreview(runtimeDir, exports)].filter(Boolean);
  } catch (error) {
    return [error.message];
  }
  const problems = [];
  const libs = LIBRARIES.map((path) => read(dir, path));
  for (const { component, meta } of previews) {
    const guide = `components/${component}/README.md`;
    if (!existsSync(join(dir, guide))) problems.push(`missing ${guide}`);
    else if (!read(dir, guide).trim()) problems.push(`${guide} is empty`);
    else if (statSync(join(dir, guide)).size > GUIDE_CAP) problems.push(`${guide} is over 64 KB`);
    const path = `components/${component}/preview.html`;
    if (!existsSync(join(dir, path))) {
      problems.push(`missing ${path}`);
      continue;
    }
    const found = await checkPreview({ html: read(dir, path), libs, bundleJs: bundle, bundleCss: css, tokensJson: tokens, expects: meta.expects });
    problems.push(...found.map((problem) => `${path}: ${problem}`));
  }
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tree = join(FRONTEND, '.design-system/project');
  const problems = existsSync(tree) ? await checkTree(tree) : ['missing .design-system/project: run npm run design:build first'];
  if (problems.length) {
    for (const problem of problems) console.error(`design:check: ${problem}`);
    process.exit(1);
  }
  console.log(`design:check: OK — ${filesUnder(tree).length} files in .design-system/project are publishable.`);
}

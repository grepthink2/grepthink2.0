/**
 * Design-export names, the third check of `npm run lint:design` (design-adherence.mjs reads the
 * manifest and the source files, runs checkNames and reports).
 *
 * design/_ds_manifest.json lists every capitalized export of the design system: `components[]`,
 * each with its `name` and its `sourcePath` (`components/<family>/<File>.jsx`). The codebase keeps
 * those names, as design/PORTING.md's component map says.
 *
 * Kit families (KIT_FAMILIES). A kit component lives at src/components/<Name>/<Name>.tsx. An
 * export the design ships in another component's file (InlineConfirm in feedback/ConfirmDialog.jsx)
 * may also live in that component's folder, in its file or in a file of its own name
 * (src/components/ConfirmDialog/ConfirmDialog.tsx or InlineConfirm.tsx). These fail:
 *   - a file anywhere else that exports a kit component;
 *   - a folder in src/components/ named after neither a kit component nor the design file that
 *     groups some (a lowercase folder, such as hooks/, holds no component and is not read);
 *   - a component file (a .ts or .tsx file whose name starts with a capital) in a component
 *     folder, named after neither the folder nor an export the design groups under it;
 *   - a component file in src/components/ named after a design export that it does not export;
 *   - a component file directly in src/components/, outside a folder.
 * Warnings: a kit component the codebase does not have yet, and a kit constant (AVATAR_COLORS)
 * declared outside its component's folder.
 *
 * Feature families (FEATURE_HOMES). Report only, since a feature file may group several exports.
 * An export is found when its feature folder declares it (exported or not) in a file named like it
 * or like its design file (SlotBoard.tsx, or ScheduleItem.tsx for ScheduleIcon); a constant in any
 * file of the folder; a model (ScheduleModel) as its module (scheduleModel.ts); and an export the
 * kit has taken over under the same name (MarkdownText) in src/components/. Declared only in
 * another file of the folder, or nowhere, it is a warning. A family whose folder does not exist
 * yet is noted once.
 *
 * Tests and the entry files directly in src/ (main.tsx, App.tsx, a local preview page's entry)
 * are not read: none of them is a component's home.
 *
 * Deliberate differences go in NAMES_ALLOWLIST: a design export the codebase keeps under another
 * name or not at all, with its status, or a folder or file in src/ that no design export names.
 * Each entry carries its reason, and one that hides nothing any more is a warning.
 *
 * Declarations are read with a quick scan, not a parser: a top-level declaration starts its line
 * (`export function Badge`, `const Hero: React.FC`, `export default Hero;`, `export { a as B };`),
 * with comments and string contents blanked first. Re-exports (`export … from`) and types are not
 * declarations.
 */

import { basename } from 'node:path';
import { splitCodeAndComments } from './ownership.mjs';

/**
 * @typedef {{ name: string; sourcePath: string }} ManifestExport
 * @typedef {{ path: string; source?: string }} SourceInput
 *   `path` is relative to frontend/ (`src/components/Avatar/Avatar.tsx`); `source` is read for
 *   .ts and .tsx files.
 * @typedef {'same name' | 'different name' | 'not ported' | 'design-only'} NameStatus
 * @typedef {{ design: string | string[]; status: NameStatus; keeps?: string; reason: string }} DesignEntry
 *   `keeps` is the codebase identifier or module (file name without extension) that stands for
 *   the design export; a 'same name' or 'different name' entry names it.
 * @typedef {{ path: string; reason: string }} PathEntry
 *   A folder (`src/components/ErrorBoundary`) or a file (`src/components/Skeleton/TableSkeleton.tsx`)
 *   that the folder and file rules leave alone.
 * @typedef {DesignEntry | PathEntry} NamesAllowlistEntry
 * @typedef {{ rule: string; subject: string; message: string }} Finding
 * @typedef {{
 *   name: string; sourcePath: string; family: string; kit: boolean; allowlisted: boolean;
 *   status: NameStatus | 'misplaced' | 'unmatched'; codebase: string; note: string;
 * }} AuditRow
 *   One row for each manifest export. `codebase` is where the export lives (paths), or the name
 *   its NAMES_ALLOWLIST entry says the codebase keeps; `note` is the entry's reason or what the
 *   rule found.
 * @typedef {{ failures: Finding[]; warnings: Finding[]; notes: Finding[]; audit: AuditRow[] }} NamesResult
 */

/** The design families whose components port to src/components/<Name>/. */
export const KIT_FAMILIES = ['primitives', 'display', 'feedback', 'navigation'];

/**
 * Where each feature family's exports live, relative to frontend/ (design/PORTING.md's map of the
 * feature layers). A domain card belongs to the feature that owns it, so domain reads them all.
 * @type {Record<string, string[]>}
 */
export const FEATURE_HOMES = {
  analytics: ['src/features/analytics'],
  assistant: ['src/features/app/components/Assistant'],
  domain: ['src/features'],
  finalreviews: ['src/features/finalReviews'],
  marketing: ['src/features/landing'],
  releases: ['src/features/releases'],
  schedule: ['src/features/schedule'],
  scrum: ['src/features/scrum'],
  search: ['src/features/search'],
};

/** @type {NameStatus[]} */
export const NAME_STATUSES = ['same name', 'different name', 'not ported', 'design-only'];

/**
 * Design exports the codebase keeps under another name or not at all, and folders or files in
 * src/ that no design export names. Each entry is a reason, not a rubber stamp.
 * @type {NamesAllowlistEntry[]}
 */
export const NAMES_ALLOWLIST = [
  // ── Kit ───────────────────────────────────────────────────────────────────────────────────────
  {
    design: ['Combobox', 'FileUpload', 'MarkdownEditor', 'Stepper'],
    status: 'not ported',
    reason:
      'The composites join the kit after the final-review screens. Until then the screens keep ' +
      'their own pickers, file inputs and Markdown editors, and the TSR flow its TsrsStepper.',
  },
  {
    design: 'Markdown',
    status: 'design-only',
    reason:
      "The bundle's namespace for display/Markdown.jsx, since each design file needs an export of its " +
      'own name. The renderer is MarkdownText, in src/components/Markdown/.',
  },
  {
    design: ['SidebarNavItem', 'SidebarSectionTitle'],
    status: 'different name',
    keeps: 'Sidebar',
    reason:
      "The app's sidebar is their one consumer and renders its rows (.sidebar-item) and section " +
      'titles (.section-title) itself.',
  },
  {
    design: 'ProfileMenu',
    status: 'same name',
    keeps: 'ProfileMenu',
    reason:
      "The app header's profile menu is a composition of the kit (Popover, Menu, Avatar, NewDot) with the app's " +
      'auth, class and preview state, so it lives with the header it belongs to, in ' +
      'features/app/components/Layout/ProfileMenu.tsx, as design_handoff_whats_new/NOTES.md places it.',
  },
  {
    path: 'src/features/app/components/Layout/ProfileMenu.tsx',
    reason: "ProfileMenu's home beside the app header (see the ProfileMenu entry).",
  },
  {
    path: 'src/components/ErrorBoundary',
    reason: 'The error boundary App.tsx puts around the routes has no design counterpart.',
  },
  {
    path: 'src/components/Skeleton/TableSkeleton.tsx',
    reason:
      "The loading state of the app's own *-list tables (RosterList, ProjectList, Modules, " +
      "Assignments). The kit's Table draws its Skeleton rows itself.",
  },

  // ── analytics ─────────────────────────────────────────────────────────────────────────────────
  {
    design: 'RANGE_PRESETS',
    status: 'different name',
    keeps: 'CHIPS',
    reason:
      "AnalyticsFilterRow's preset chips ({ preset, label }), private to the file; the dashboard " +
      'hook checks the URL against its own PRESETS.',
  },
  {
    design: ['BREAKDOWN_COLUMNS', 'TEAM_BREAKDOWN_COLUMNS'],
    status: 'different name',
    keeps: 'breakdownColumns',
    reason: "BreakdownTable builds both column sets with breakdownColumns(kind), which the page's CSV export shares.",
  },
  {
    design: 'BOARD_STATUSES',
    status: 'different name',
    keeps: 'STATUS_LABEL',
    reason: 'StackedBars keeps the board statuses as ORDER and STATUS_LABEL, private to the file.',
  },
  {
    design: 'ChartFormat',
    status: 'different name',
    keeps: 'analyticsFormat',
    reason:
      'The format helpers live in utils/analyticsFormat.ts (percent, weekLabel, dateLabel, ' +
      'rangeLabel) and the scale in utils/chartGeometry.ts.',
  },
  {
    design: ['TimelinessBars', 'TIMELINESS_BUCKETS', 'TIMELINESS_COLUMNS', 'OnTimeMeter'],
    status: 'not ported',
    reason: "Timeliness ships with analytics' sub-project C; the first release has none of it.",
  },
  {
    design: 'AnalyticsIcon',
    status: 'design-only',
    reason: 'Lucide-shaped glyphs for the design bundle; the codebase imports lucide-react.',
  },

  // ── domain ────────────────────────────────────────────────────────────────────────────────────
  {
    design: 'AssignmentCard',
    status: 'different name',
    keeps: 'StudentHomeDashboard',
    reason:
      "Student Home builds its deadline rows in place (.student-home__deadline-row, the design's " +
      'five statuses), and StudentAssignmentsTable its table rows.',
  },
  {
    design: 'ConversationListItem',
    status: 'different name',
    keeps: 'ConversationList',
    reason: 'ConversationList renders its rows (.messages-list__item) itself.',
  },
  {
    design: 'JoinRequestCard',
    status: 'different name',
    keeps: 'RequestsModal',
    reason: 'RequestsModal (.requests-modal__card) and Student Home (.student-home__request-card) build the request rows in place.',
  },
  {
    design: 'MeetingCard',
    status: 'different name',
    keeps: 'TeamMeetingCard',
    reason:
      "The TA pages' card for a team's weekly TA meeting (.ta-card). The design keeps MeetingCard: " +
      '"team meeting" means the one-off kind, so the codebase card takes a TA-meeting name when the TA pages ' +
      'move onto the kit.',
  },
  {
    design: 'PieChartCard',
    status: 'different name',
    keeps: 'PieCharts',
    reason:
      "The design's SVG stand-in for recharts. The roster's PieCharts, the stats' " +
      'ProjectMembershipChart and the TSR ContributionsTab draw their pies with recharts.',
  },
  {
    design: 'BarChartCard',
    status: 'design-only',
    reason:
      "The design's SVG stand-in for a recharts bar chart, which no screen draws; the analytics " +
      'bars are BarsBySprint and StackedBars.',
  },
  {
    design: 'ProjectCard',
    status: 'different name',
    keeps: 'ProjectGrid',
    reason: 'ProjectGrid renders each project tile (.project-grid__card) itself.',
  },
  {
    design: 'RosterRow',
    status: 'different name',
    keeps: 'RosterList',
    reason: "RosterList renders the roster's table rows and phone cards itself.",
  },
  {
    design: 'TSRForm',
    status: 'different name',
    keeps: 'TSRS',
    reason: 'The TSR flow: TSRS steps through ContributionsTab, TeamFeedbackTab and ScrumMasterTab.',
  },
  {
    design: 'TSRSummaryCard',
    status: 'different name',
    keeps: 'TSRView',
    reason: "Staff read the submissions in TSRView's tables.",
  },
  {
    design: 'TeamMemberCard',
    status: 'different name',
    keeps: 'AdminMemberCard',
    reason:
      "Edit Project's member card (.edit-project__member-card), with the admin toggle. The design keeps the " +
      "broader name, and the codebase card takes it when Edit Project's Team tab moves onto the kit.",
  },
  {
    design: 'TypingIndicator',
    status: 'different name',
    keeps: 'MessagingSpotlight',
    reason:
      "Only the landing page's messaging spotlight draws typing dots, in place " +
      '(.msg-live__typing); the app\'s messages show none.',
  },

  // ── marketing ─────────────────────────────────────────────────────────────────────────────────
  {
    design: 'AnnouncementPill',
    status: 'different name',
    keeps: 'Hero',
    reason: 'Hero renders its announcement pill (.hero__announce) itself.',
  },
  {
    design: 'Eyebrow',
    status: 'different name',
    keeps: 'Hero',
    reason: 'The eyebrows are markup in Hero (.hero__eyebrow) and ContactCard (.contact-page__eyebrow).',
  },
  {
    design: 'MarketingBadge',
    status: 'different name',
    keeps: 'Spotlight',
    reason: 'Spotlight renders its New / Soon badge (.spotlight__badge) itself.',
  },
  {
    design: ['FeatureColumn', 'PreviewWindow'],
    status: 'different name',
    keeps: 'Solutions',
    reason: 'Solutions renders its feature columns (.feature-col) and the app preview (.preview-window) itself.',
  },
  {
    design: 'FloatCard',
    status: 'different name',
    keeps: 'FloatingCards',
    reason: 'FloatingCards renders each card (.float-card) itself.',
  },
  {
    design: 'Stage',
    status: 'different name',
    keeps: 'Spotlight',
    reason: 'Spotlight renders the stage behind its cards (.spotlight__stage) itself.',
  },
  {
    design: 'LandingHeader',
    status: 'different name',
    keeps: 'Header',
    reason:
      "The landing page's header is features/landing/components/Header.tsx (.landing-header). Kept for good: " +
      "the design's name says which header, and the app shell has a Header of its own.",
  },
  {
    design: 'LandingFooter',
    status: 'different name',
    keeps: 'Footer',
    reason:
      "The landing page's footer is features/landing/components/Footer.tsx (.landing-footer). Kept for good, " +
      'with LandingHeader.',
  },

  // ── releases ──────────────────────────────────────────────────────────────────────────────────
  {
    design: 'ReleasesModel',
    status: 'different name',
    keeps: 'version',
    reason:
      "The design's one file for the release rules. The codebase splits them by job: version.ts (parseVersion, " +
      'compareVersions), releaseNotes.ts (the notes parser), releaseDate.ts (formatReleaseDate) and seenStore.ts ' +
      '(isUnseen, isReleaseNew, the seen state).',
  },

  // ── schedule ──────────────────────────────────────────────────────────────────────────────────
  {
    design: ['ScheduleList', 'ScheduleDivider'],
    status: 'not ported',
    reason:
      "They come with the Today's Schedule card and the /app/schedule agenda, which wait for " +
      'GET /api/schedule. The rows are ported already: team meetings render ScheduleItem and ScheduleDayHeader.',
  },
  {
    design: 'SCHEDULE_KINDS',
    status: 'different name',
    keeps: 'KINDS',
    reason: 'scheduleModel.ts keeps the kind palette private as KINDS and hands it out through kindMeta().',
  },
  {
    design: 'SCHOOL_ZONE',
    status: 'same name',
    keeps: 'SCHOOL_ZONE',
    reason:
      'It lives in src/lib/schoolZone.ts: it is the last resort of useSchoolTimezone (lib/institutions.ts) as ' +
      'well as of viewerZone() in scheduleModel.ts, and the lib layer does not import from a feature. The design ' +
      "uses it as the default zone of every formatter; here they default to the viewer's zone, and each caller " +
      "is handed its class's school zone.",
  },

  // ── scrum ─────────────────────────────────────────────────────────────────────────────────────
  {
    design: 'Chips',
    status: 'design-only',
    reason:
      "The bundle's namespace for scrum/Chips.jsx, since each design file needs an export of its own " +
      'name. The four chips share features/scrum/components/Chips.tsx.',
  },
  {
    design: 'AIDraftButton',
    status: 'not ported',
    reason: 'AI drafting is off in the web client, and scrum.scss leaves out .gt-aidraft until it returns.',
  },
  {
    design: 'MentionListbox',
    status: 'not ported',
    reason: 'Comments have no @mentions yet (issue #191); the composer is a plain textarea.',
  },

  // ── search ────────────────────────────────────────────────────────────────────────────────────
  {
    design: 'ModKey',
    status: 'design-only',
    reason:
      "The bundle's capitalized alias of modKey(), since only capitalized exports reach its " +
      'namespace. The codebase keeps modKey in features/search/format.ts.',
  },
];

const COMPONENTS = 'src/components/';

/** SCREAMING_SNAKE_CASE: a constant, not a component. */
const isConstant = (name) => /^[A-Z][A-Z0-9_]+$/.test(name);
/** A model namespace (ScheduleModel), which the codebase keeps as a module (scheduleModel.ts). */
const isModel = (name) => /^[A-Z]\w*Model$/.test(name);
const startsUpper = (name) => /^[A-Z]/.test(name);
const lowerFirst = (name) => name.charAt(0).toLowerCase() + name.slice(1);
const stemOf = (path) => basename(path).replace(/\.[^.]*$/, '');
const withoutExtension = (path) => path.replace(/\.tsx?$/, '');
const list = (paths) => paths.join(', ');

/** Tests and test setup: no component lives there. */
function isTestPath(path) {
  return path.includes('/__tests__/') || basename(path).includes('.test.') || path.startsWith('src/test/');
}

/** main.tsx, App.tsx and a local preview page's entry, directly in src/: no component's home. */
const isEntryFile = (path) => /^src\/[^/]+$/.test(path);

/** Whether checkNames reads a file's declarations. */
function isRead(path) {
  return /\.tsx?$/.test(path) && !path.endsWith('.d.ts') && !isTestPath(path) && !isEntryFile(path);
}

// A top-level declaration starts its line, as the formatter writes it; a nested one is indented
// and is no name of the module.
const DECLARATION =
  /^(export[ \t]+(?:default[ \t]+)?)?(?:declare[ \t]+)?(?:abstract[ \t]+)?(?:async[ \t]+)?(?:function\b[ \t]*\*?|const\b|let\b|var\b|class\b|enum\b)[ \t]*([A-Za-z_$][\w$]*)/gm;
const DEFAULT_EXPORT = /^export[ \t]+default[ \t]+([A-Za-z_$][\w$]*)[ \t]*;?[ \t]*$/gm;
const EXPORT_LIST = /^export[ \t]*(type\b)?[ \t]*\{([^}]*)\}[ \t]*(from\b)?/gm;
const NOT_A_NAME = new Set(['extends', 'enum', 'function', 'class']);

// The source with its comments and the contents of its strings and template literals blanked,
// lines kept, so that a declaration quoted in a string or a comment is not read.
function codeOf(source) {
  const { code, literals } = splitCodeAndComments(source, { script: true });
  const chars = code.split('');
  for (const { start, text } of literals) {
    for (let i = start; i < start + text.length; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

/**
 * The names a module declares at its top level, and those it exports (its default export under
 * its local name).
 * @param {string} source
 * @returns {{ exported: Set<string>; declared: Set<string> }}
 */
export function declarationsOf(source) {
  const code = codeOf(source);
  const exported = new Set();
  const declared = new Set();
  for (const [, exportKeyword, name] of code.matchAll(DECLARATION)) {
    if (NOT_A_NAME.has(name)) continue;
    declared.add(name);
    if (exportKeyword) exported.add(name);
  }
  for (const [, name] of code.matchAll(DEFAULT_EXPORT)) exported.add(name);
  for (const [, typeOnly, names, from] of code.matchAll(EXPORT_LIST)) {
    if (typeOnly || from) continue;
    for (const part of names.split(',')) {
      const [local, as] = part.trim().split(/\s+as\s+/);
      if (!local || local.startsWith('type ')) continue;
      exported.add(as && as !== 'default' ? as : local);
    }
  }
  return { exported, declared };
}

// The manifest's exports with their family (`display`) and design file (`Avatar`).
function designExportsOf(manifest) {
  const components = manifest?.components;
  if (!Array.isArray(components)) throw new Error('design/_ds_manifest.json has no components[] list');
  return components.map((entry, i) => {
    const { name, sourcePath } = entry ?? {};
    if (typeof name !== 'string' || typeof sourcePath !== 'string') {
      throw new Error(`design/_ds_manifest.json: components[${i}] has no name or sourcePath`);
    }
    const [root, family] = sourcePath.split('/');
    return { name, sourcePath, family: root === 'components' ? (family ?? '') : '', file: stemOf(sourcePath) };
  });
}

// Why an allowlist entry cannot be used, or '' when it can.
function entryProblem(entry) {
  if (!entry || typeof entry !== 'object') return 'is not an object';
  if (!entry.reason || typeof entry.reason !== 'string') return 'has no reason';
  if (('path' in entry) === ('design' in entry)) return 'needs either `design` (export names) or `path`, not both';
  if ('path' in entry) {
    return typeof entry.path === 'string' && entry.path.startsWith('src/') ? '' : 'has a path outside src/';
  }
  const names = [entry.design].flat();
  if (names.length === 0 || names.some((n) => typeof n !== 'string' || !n)) return 'names no design export';
  if (!NAME_STATUSES.includes(entry.status)) return `has no status (${NAME_STATUSES.join(', ')})`;
  if ((entry.status === 'same name' || entry.status === 'different name') && !entry.keeps) {
    return `is '${entry.status}' but says no codebase name it keeps`;
  }
  return '';
}

/**
 * Checks the names of the codebase against the design's exports.
 * @param {{ components?: ManifestExport[] }} manifest design/_ds_manifest.json, parsed
 * @param {SourceInput[]} files every file under src/, with the source of each .ts and .tsx file
 * @param {NamesAllowlistEntry[]} [allowlist]
 * @returns {NamesResult}
 */
export function checkNames(manifest, files, allowlist = NAMES_ALLOWLIST) {
  /** @type {NamesResult} */
  const result = { failures: [], warnings: [], notes: [], audit: [] };
  const fail = (rule, subject, message) => result.failures.push({ rule, subject, message });
  const warn = (rule, subject, message) => result.warnings.push({ rule, subject, message });

  const designs = designExportsOf(manifest);
  const designNames = new Set(designs.map((d) => d.name));
  const kit = designs.filter((d) => KIT_FAMILIES.includes(d.family));
  const kitComponents = new Set(kit.filter((d) => !isConstant(d.name)).map((d) => d.name));
  /** @type {Map<string, Set<string>>} kit design file → the names it exports */
  const groupedUnder = new Map();
  for (const d of kit) groupedUnder.set(d.file, (groupedUnder.get(d.file) ?? new Set()).add(d.name));

  const paths = files.map((f) => f.path);
  const sources = files
    .filter((f) => isRead(f.path) && typeof f.source === 'string')
    .map((f) => ({ path: f.path, stem: stemOf(f.path), ...declarationsOf(f.source) }));
  const exportersOf = (name) => sources.filter((f) => f.exported.has(name));
  const declarersOf = (name) => sources.filter((f) => f.declared.has(name));

  /** @type {Map<string, DesignEntry>} */
  const byName = new Map();
  /** @type {PathEntry[]} */
  const pathEntries = [];
  allowlist.forEach((entry, i) => {
    const problem = entryProblem(entry);
    if (problem) {
      fail('allowlist', `NAMES_ALLOWLIST[${i}]`, `NAMES_ALLOWLIST[${i}] ${problem}.`);
    } else if ('path' in entry) {
      pathEntries.push(entry);
    } else {
      for (const name of [entry.design].flat()) {
        if (byName.has(name)) {
          fail('allowlist', `NAMES_ALLOWLIST[${i}]`, `NAMES_ALLOWLIST[${i}] lists ${name}, which an earlier entry lists too.`);
        } else {
          byName.set(name, entry);
        }
      }
    }
  });
  const pathAllowed = (path) => pathEntries.some((e) => path === e.path || path.startsWith(`${e.path}/`));

  const row = (d, status, codebase = '', note = '', fromAllowlist = false) =>
    result.audit.push({
      name: d.name,
      sourcePath: d.sourcePath,
      family: d.family,
      kit: KIT_FAMILIES.includes(d.family),
      allowlisted: fromAllowlist,
      status,
      codebase,
      note,
    });
  const allowlisted = (d, entry, matched) => {
    if (matched) {
      warn(
        'allowlist-stale',
        d.name,
        `NAMES_ALLOWLIST lists ${d.name}, which ${matched} now has under its design name: remove it from the entry.`,
      );
    }
    row(d, entry.status, entry.keeps ?? '', entry.reason, true);
  };

  // ── Kit: each export in its place ─────────────────────────────────────────────────────────────
  const misplacedPaths = new Set();
  for (const d of kit) {
    const entry = byName.get(d.name);
    if (isConstant(d.name)) {
      const folder = `${COMPONENTS}${d.file}/`;
      const sites = declarersOf(d.name);
      const home = sites.filter((f) => f.path.startsWith(folder));
      if (entry) {
        allowlisted(d, entry, home[0]?.path);
      } else if (home.length > 0) {
        row(d, 'same name', list(home.map((f) => f.path)));
      } else {
        warn(
          'kit-constant',
          d.name,
          sites.length > 0
            ? `${d.name} (${d.sourcePath}) is declared in ${list(sites.map((f) => f.path))}, outside ${folder}, where ${d.file} lives.`
            : `${d.name} (${d.sourcePath}) is declared nowhere in src/; it belongs with ${d.file}, in ${folder}.`,
        );
        row(d, 'unmatched', list(sites.map((f) => f.path)));
      }
      continue;
    }
    const homes = new Set([`${COMPONENTS}${d.name}/${d.name}`]);
    if (d.name !== d.file) homes.add(`${COMPONENTS}${d.file}/${d.file}`).add(`${COMPONENTS}${d.file}/${d.name}`);
    const where =
      d.name === d.file
        ? `${COMPONENTS}${d.name}/${d.name}.tsx`
        : `${COMPONENTS}${d.name}/${d.name}.tsx, or beside ${d.file} in ${COMPONENTS}${d.file}/ as the design groups it`;
    const sites = exportersOf(d.name);
    const home = sites.filter((f) => homes.has(withoutExtension(f.path)));
    const misplaced = sites.filter((f) => !homes.has(withoutExtension(f.path)) && !pathAllowed(f.path));
    for (const f of misplaced) {
      misplacedPaths.add(f.path);
      fail('kit-place', f.path, `${f.path} exports ${d.name}, a kit component (${d.sourcePath}); it belongs in ${where}.`);
    }
    if (entry) {
      allowlisted(d, entry, home[0]?.path);
    } else if (home.length > 0) {
      const beside = home.some((f) => !f.path.startsWith(`${COMPONENTS}${d.name}/`));
      row(d, 'same name', list(home.map((f) => f.path)), beside ? `with ${d.file}, as the design groups it` : '');
    } else if (misplaced.length > 0) {
      row(d, 'misplaced', list(misplaced.map((f) => f.path)));
    } else {
      warn(
        'kit-missing',
        d.name,
        `${d.name} (${d.sourcePath}) has no home in src/components/ yet: port it to ${COMPONENTS}${d.name}/${d.name}.tsx, ` +
          'or give it a NAMES_ALLOWLIST entry that says when it comes.',
      );
      row(d, 'unmatched');
    }
  }

  // ── Kit: folders and component files named after the design ──────────────────────────────────
  const folders = new Set();
  for (const path of paths) {
    const parts = path.startsWith(COMPONENTS) ? path.slice(COMPONENTS.length).split('/') : [];
    if (parts.length > 1 && startsUpper(parts[0])) folders.add(parts[0]);
  }
  // A folder takes a kit component's name, or the name of the design file that groups its exports.
  const kitFolder = (folder) => kitComponents.has(folder) || groupedUnder.has(folder);
  for (const folder of [...folders].sort()) {
    const path = `${COMPONENTS}${folder}`;
    if (kitFolder(folder) || pathAllowed(path)) continue;
    const near = [...kitComponents].find((n) => n.toLowerCase() === folder.toLowerCase());
    fail(
      'kit-folder',
      `${path}/`,
      `${path}/ is named after no kit component in the design${near ? `: the design calls it ${near}` : ''}.`,
    );
  }
  for (const f of sources) {
    if (!f.path.startsWith(COMPONENTS) || !startsUpper(f.stem)) continue;
    const parts = f.path.slice(COMPONENTS.length).split('/');
    const folder = parts.length > 1 ? parts[0] : '';
    if (designNames.has(f.stem) && !f.exported.has(f.stem)) {
      fail('kit-export', f.path, `${f.path} is named after the design export ${f.stem} but does not export it.`);
    }
    if (pathAllowed(f.path) || misplacedPaths.has(f.path)) continue;
    if (!folder) {
      fail(
        'kit-loose',
        f.path,
        `${f.path} sits directly in src/components/; a shared component lives in a folder of its name (${COMPONENTS}${f.stem}/${f.stem}.tsx).`,
      );
      continue;
    }
    if (!startsUpper(folder) || f.stem === folder || groupedUnder.get(folder)?.has(f.stem)) continue;
    const designHome = kit.find((d) => d.name === f.stem);
    const hint = !designHome
      ? ''
      : designHome.file === designHome.name
        ? `; ${f.stem} is a kit component of its own (${COMPONENTS}${f.stem}/${f.stem}.tsx)`
        : `; the design groups ${f.stem} under ${designHome.file}`;
    fail(
      'kit-file',
      f.path,
      `${f.path} is named after neither ${folder} nor an export the design groups under ${folder}${hint}.`,
    );
  }

  // ── Feature layers: report only ───────────────────────────────────────────────────────────────
  /** @type {Map<string, number>} */
  const missingFamilies = new Map();
  /** @type {Map<string, number>} */
  const unknownFamilies = new Map();
  for (const d of designs) {
    if (KIT_FAMILIES.includes(d.family)) continue;
    const entry = byName.get(d.name);
    const homes = FEATURE_HOMES[d.family];
    if (!homes) {
      unknownFamilies.set(d.family, (unknownFamilies.get(d.family) ?? 0) + 1);
      if (entry) allowlisted(d, entry);
      else row(d, 'unmatched');
      continue;
    }
    const inHome = (path) => homes.some((h) => path.startsWith(`${h}/`));
    const homeSources = sources.filter((f) => inHome(f.path));
    const declares = homeSources.filter((f) => f.declared.has(d.name));
    const exact = isConstant(d.name)
      ? declares
      : [
          ...(isModel(d.name) ? homeSources.filter((f) => f.stem === lowerFirst(d.name)) : []),
          ...declares.filter((f) => f.stem === d.name || f.stem === d.file),
        ];
    const elsewhere = declares.filter((f) => !exact.includes(f));
    const inKit = exportersOf(d.name).filter((f) => f.path.startsWith(COMPONENTS));
    if (entry) {
      allowlisted(d, entry, exact[0]?.path ?? inKit[0]?.path);
    } else if (exact.length > 0) {
      row(d, 'same name', list(exact.map((f) => f.path)), exact.every((f) => f.stem !== d.name) ? `in ${exact[0].stem}` : '');
    } else if (inKit.length > 0) {
      row(d, 'same name', list(inKit.map((f) => f.path)), 'taken over by the kit');
    } else if (elsewhere.length > 0) {
      warn(
        'feature-file',
        d.name,
        `${d.name} (${d.sourcePath}) is in ${list(elsewhere.map((f) => f.path))}: neither ${d.name}.tsx nor ${d.file}.tsx, as the design files it.`,
      );
      row(d, 'same name', list(elsewhere.map((f) => f.path)), `in ${elsewhere[0].stem}, not ${d.file}`);
    } else if (!paths.some(inHome)) {
      missingFamilies.set(d.family, (missingFamilies.get(d.family) ?? 0) + 1);
      row(d, 'not ported', '', `${list(homes)}/ does not exist yet`);
    } else {
      warn(
        'feature-missing',
        d.name,
        `${d.name} (${d.sourcePath}) has no counterpart of that name in ${list(homes.map((h) => `${h}/`))}.`,
      );
      row(d, 'unmatched');
    }
  }
  for (const [family, count] of missingFamilies) {
    result.notes.push({
      rule: 'family-missing',
      subject: family,
      message: `components/${family}/: ${count} export(s) wait for ${list(FEATURE_HOMES[family].map((h) => `${h}/`))}, which does not exist yet.`,
    });
  }
  for (const [family, count] of unknownFamilies) {
    warn(
      'family-unknown',
      family,
      `components/${family || '?'}/ (${count} export(s)) is a family names.mjs does not know: give it a home in FEATURE_HOMES, after design/PORTING.md's map.`,
    );
  }

  // ── Allowlist entries that hide nothing any more ──────────────────────────────────────────────
  const declaredAnywhere = (name) => sources.some((f) => f.declared.has(name) || f.stem === name);
  for (const entry of new Set(byName.values())) {
    const names = [entry.design].flat();
    for (const name of names.filter((n) => !designNames.has(n))) {
      warn('allowlist-stale', name, `NAMES_ALLOWLIST lists ${name}, which design/_ds_manifest.json no longer exports: remove it.`);
    }
    if (entry.keeps && !declaredAnywhere(entry.keeps)) {
      warn(
        'allowlist-stale',
        entry.keeps,
        `NAMES_ALLOWLIST says the codebase keeps ${entry.keeps} for ${names.join(', ')}, but src/ no longer declares it.`,
      );
    }
  }
  for (const entry of pathEntries) {
    const [folder, file] = entry.path.startsWith(COMPONENTS) ? entry.path.slice(COMPONENTS.length).split('/') : [];
    const exists = paths.some((p) => p === entry.path || p.startsWith(`${entry.path}/`));
    const passes = file
      ? stemOf(file) === folder || Boolean(groupedUnder.get(folder)?.has(stemOf(file)))
      : Boolean(folder) && kitFolder(folder);
    if (!exists) {
      warn('allowlist-stale', entry.path, `NAMES_ALLOWLIST lists ${entry.path}, which no longer exists: remove it.`);
    } else if (passes) {
      warn('allowlist-stale', entry.path, `NAMES_ALLOWLIST lists ${entry.path}, which the design now names: remove it.`);
    }
  }

  return result;
}

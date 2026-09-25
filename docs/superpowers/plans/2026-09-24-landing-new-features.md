# Landing feature bands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three spotlight bands (scrum board, messaging, project assistant), a hero
announcement pill, a closing band, header/footer anchors and share metadata to grepthink2.com,
as specified in `docs/superpowers/specs/2026-09-24-landing-new-features-design.md`.

**Architecture:** One `Spotlight` band shell renders the text column and an `aria-hidden` stage;
each feature supplies its copy and its stage of floating `StageCard`s in its own file. Scroll
effects are CSS, switched on by classes that a small `useInView` hook sets
(`is-seen` latches once, `is-offscreen` pauses floats). Base styles are each band's final
frame, so reduced motion simply turns animation off. Launch state lives in `landing.config.ts`.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`), React Router 7, SCSS with
the `@styles` variables and `--gt-*` tokens, lucide-react 1.x, Vitest 5 + Testing Library (jsdom).

**Working directory:** worktree `.claude/worktrees/landing-new-features` (branch
`feat/landing-new-features`, from `origin/beta`). Frontend commands run in `frontend/`.
`npm ci` has been run there.

**Conventions that bite here:**
- `npm run lint` fails on any warning; every react-hooks rule is an error;
  `react-refresh/only-export-components` allows only components (and primitive constants) as
  exports of a component file.
- `npm run lint:design` fails on any hex literal in `.scss/.css/.ts/.tsx` unless the file has a
  ledger comment containing a marker such as "bespoke", "left as" or "verbatim". `rgba()` is not
  scanned. Keep hex out of `.tsx`; put bespoke hex in SCSS variables under a ledger comment.
- jsdom has no `IntersectionObserver`, `matchMedia` or `scrollIntoView`.

---

## File structure

| File | Responsibility |
|---|---|
| `frontend/src/features/landing/landing.config.ts` | Launch settings: section ids, band badges, announcement, `sectionLink()` |
| `frontend/src/features/landing/hooks/useInView.ts` | `seen` (latched) and `visible` (live) for one element |
| `frontend/src/features/landing/components/spotlights/Spotlight.tsx` + `.scss` | Band shell; stage backdrops; floating-card shell; shared widget parts; responsive and reduced-motion rules |
| `.../spotlights/StageCard.tsx` | One floating card with its reveal order |
| `.../spotlights/StageSwap.tsx` | Two stacked values that trade places during a moment |
| `.../spotlights/ScrumSpotlight.tsx` + `.scss` | Band 1 copy and stage (board, task card, burnup) |
| `.../spotlights/MessagingSpotlight.tsx` + `.scss` | Band 2 copy and stage (inbox, thread) |
| `.../spotlights/AssistantSpotlight.tsx` + `.scss` | Band 3 copy and preview stage (stalled flag, suggestion, report check, PR chip) |
| `frontend/src/features/landing/components/ClosingBand.tsx` + `.scss` | Closing call to action |
| `frontend/src/features/landing/components/Hero.tsx` / `Hero.scss` | Announcement pill, subtitle, eyebrow contrast |
| `frontend/src/features/landing/components/Header.tsx` / `Header.scss` | "Features" link |
| `frontend/src/features/landing/components/Footer.tsx` | Product anchors |
| `frontend/src/features/landing/LandingPage.tsx` / `LandingPage.scss` | Composition, scroll-to-hash, anchor offset |
| `frontend/index.html` | Description, Open Graph, Twitter meta |
| `frontend/src/features/landing/__tests__/*.test.tsx` | Tests for the hook, the shell, the hero and the page |

---

### Task 0: Baseline

- [ ] **Step 1: Record the gates and the entry bundle size before any change**

Run (in `frontend/`):
```bash
npx vitest run 2>&1 | tail -4
npm run build 2>&1 | grep -E "assets/index-" | head -2
```
Expected: `Tests  177 passed (177)`; note the `index-*.js` and `index-*.css` sizes for Task 11.

---

### Task 1: Launch config and the `useInView` hook

**Files:**
- Create: `frontend/src/features/landing/landing.config.ts`
- Create: `frontend/src/features/landing/hooks/useInView.ts`
- Test: `frontend/src/features/landing/__tests__/useInView.test.tsx`

- [ ] **Step 1: Write the config**

```ts
/**
 * Launch settings for the landing page's feature bands. Change a band's badge when its
 * feature's status changes, and set ANNOUNCEMENT to null to retire the hero pill (the plain
 * eyebrow and the original subtitle come back).
 */
export type BandBadge = 'new' | 'soon' | null;

export interface Announcement {
  /** Visible text of the hero pill, after its NEW badge. */
  label: string;
  /** Id of the section the pill scrolls to. */
  targetId: string;
}

export const SECTION_IDS = {
  scrum: 'scrum-board',
  messaging: 'messaging',
  assistant: 'project-assistant',
} as const;

export const BAND_BADGES: Record<keyof typeof SECTION_IDS, BandBadge> = {
  scrum: 'new',
  messaging: 'new',
  assistant: 'soon',
};

export const ANNOUNCEMENT: Announcement | null = {
  label: 'Scrum boards and team channels',
  targetId: SECTION_IDS.scrum,
};

/** Router target for a landing section; works from any page that renders the header or footer. */
export const sectionLink = (id: string) => ({ pathname: '/', hash: `#${id}` });
```

- [ ] **Step 2: Write the failing hook test**

```tsx
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInView } from '../hooks/useInView';

type Entry = { isIntersecting: boolean };

class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly callback: (entries: Entry[]) => void;
  readonly options: IntersectionObserverInit | undefined;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: (entries: Entry[]) => void, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.instances.push(this);
  }
}

function Probe() {
  const [ref, { seen, visible }] = useInView<HTMLDivElement>();
  return <div ref={ref} data-testid="probe" data-seen={String(seen)} data-visible={String(visible)} />;
}

afterEach(() => {
  FakeObserver.instances = [];
  vi.unstubAllGlobals();
});

describe('useInView', () => {
  it('latches seen on the first intersection and tracks visibility live', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<Probe />);
    const probe = screen.getByTestId('probe');
    const [observer] = FakeObserver.instances;
    expect(observer.observe).toHaveBeenCalledWith(probe);
    expect(observer.options?.rootMargin).toBe('0px 0px -20% 0px');
    expect(probe).toHaveAttribute('data-seen', 'false');

    act(() => observer.callback([{ isIntersecting: true }]));
    expect(probe).toHaveAttribute('data-seen', 'true');
    expect(probe).toHaveAttribute('data-visible', 'true');

    act(() => observer.callback([{ isIntersecting: false }]));
    expect(probe).toHaveAttribute('data-seen', 'true');
    expect(probe).toHaveAttribute('data-visible', 'false');
  });

  it('disconnects when the element unmounts', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { unmount } = render(<Probe />);
    unmount();
    expect(FakeObserver.instances[0].disconnect).toHaveBeenCalled();
  });

  it('starts seen when the browser has no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-seen', 'true');
  });

  it('starts seen when the user prefers reduced motion', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-seen', 'true');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/features/landing/__tests__/useInView.test.tsx`
Expected: FAIL, cannot resolve `../hooks/useInView`.

- [ ] **Step 4: Write the hook**

```ts
import { useEffect, useRef, useState } from 'react';

export interface InViewState {
  /** Latches true the first time the element enters the watched area. */
  seen: boolean;
  /** Whether the element is in the watched area right now. */
  visible: boolean;
}

/** The upper 80% of the viewport: a band counts as seen once it rises past the bottom fifth. */
const WATCHED_AREA = '0px 0px -20% 0px';

function startsSeen(): boolean {
  if (typeof globalThis.IntersectionObserver === 'undefined') return true;
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Watches one element for the landing page's scroll effects. `seen` drives the one-time reveal
 * and each band's moment; `visible` pauses the floating cards while they are off screen. With
 * reduced motion, or without IntersectionObserver, `seen` is true from the first render, so the
 * final frame shows straight away. A root margin, not a visibility ratio, decides "seen", so a
 * band taller than the viewport still triggers.
 */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [state, setState] = useState<InViewState>(() => {
    const seen = startsSeen();
    return { seen, visible: seen };
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof globalThis.IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const visible = entry.isIntersecting;
        setState((prev) => {
          const seen = prev.seen || visible;
          return seen === prev.seen && visible === prev.visible ? prev : { seen, visible };
        });
      },
      { rootMargin: WATCHED_AREA },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, state] as const;
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/features/landing/__tests__/useInView.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/landing/landing.config.ts frontend/src/features/landing/hooks frontend/src/features/landing/__tests__/useInView.test.tsx
git commit -m "feat(landing): launch config and a visibility hook for the feature bands"
```

---

### Task 2: The band shell (`Spotlight`, `StageCard`, `StageSwap`)

**Files:**
- Create: `frontend/src/features/landing/components/spotlights/Spotlight.tsx`
- Create: `frontend/src/features/landing/components/spotlights/Spotlight.scss`
- Create: `frontend/src/features/landing/components/spotlights/StageCard.tsx`
- Create: `frontend/src/features/landing/components/spotlights/StageSwap.tsx`
- Test: `frontend/src/features/landing/__tests__/Spotlight.test.tsx`

- [ ] **Step 1: Write the failing shell test**

```tsx
import type { ComponentProps } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import Spotlight from '../components/spotlights/Spotlight';

type Props = ComponentProps<typeof Spotlight>;

function renderBand(overrides: Partial<Props> = {}) {
  const props: Props = {
    id: 'demo',
    label: 'Demo feature',
    badge: 'new',
    title: 'Say it with',
    accent: 'one line',
    lead: 'A short paragraph.',
    points: [{ icon: Bell, text: 'First point' }],
    textSide: 'left',
    children: <div data-testid="stage-child" />,
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <Spotlight {...props} />
    </MemoryRouter>,
  );
}

describe('Spotlight', () => {
  it('is a region named by its heading, with the accent inside the heading', () => {
    renderBand();
    const band = screen.getByRole('region', { name: 'Say it with one line' });
    expect(band).toHaveAttribute('id', 'demo');
    expect(within(band).getByRole('heading', { level: 2 })).toHaveTextContent('Say it with one line');
    expect(within(band).getByRole('listitem')).toHaveTextContent('First point');
  });

  it('shows the badge that the config asks for', () => {
    renderBand({ badge: 'soon' });
    const band = screen.getByRole('region');
    expect(within(band).getByText('Soon')).toBeInTheDocument();
    expect(within(band).queryByText('New')).not.toBeInTheDocument();
  });

  it('shows no badge when the feature has none', () => {
    renderBand({ badge: null });
    const band = screen.getByRole('region');
    expect(within(band).queryByText('New')).not.toBeInTheDocument();
    expect(within(band).queryByText('Soon')).not.toBeInTheDocument();
  });

  it('hides the decorative stage from assistive tech', () => {
    renderBand();
    const stage = screen.getByTestId('stage-child').parentElement;
    expect(stage).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the staff note and the link when given', () => {
    renderBand({
      aside: { title: 'For TAs and instructors', text: 'Staff detail.' },
      cta: { label: 'Want early access? Get in touch', to: '/contact' },
    });
    expect(screen.getByText('For TAs and instructors')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Want early access\? Get in touch/ })).toHaveAttribute('href', '/contact');
  });

  it('puts the text on the right when asked', () => {
    renderBand({ textSide: 'right' });
    expect(screen.getByRole('region')).toHaveClass('spotlight--text-right');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/landing/__tests__/Spotlight.test.tsx`
Expected: FAIL, cannot resolve `../components/spotlights/Spotlight`.

- [ ] **Step 3: Write `StageCard.tsx`**

```tsx
import React from 'react';

interface StageCardProps {
  /** Classes that place, size and tilt the card; each stage's stylesheet defines them. */
  className: string;
  /** Position in the reveal sequence; each step starts 80ms later. */
  order: number;
  children: React.ReactNode;
}

/** One floating card on a spotlight stage, in the hero's card shell. */
const StageCard: React.FC<StageCardProps> = ({ className, order, children }) => (
  <div
    className={`stage-card ${className}`}
    style={{ '--reveal-order': order } as React.CSSProperties}
  >
    {children}
  </div>
);

export default StageCard;
```

- [ ] **Step 4: Write `StageSwap.tsx`**

```tsx
import React from 'react';

interface StageSwapProps {
  before: React.ReactNode;
  after: React.ReactNode;
  className?: string;
}

/**
 * Two stacked values that trade places during a band's moment: `before` shows until the swap,
 * `after` from then on. `after` is also the still frame for reduced motion.
 */
const StageSwap: React.FC<StageSwapProps> = ({ before, after, className = '' }) => (
  <span className={`stage-swap ${className}`.trim()}>
    <span className="stage-swap__before">{before}</span>
    <span className="stage-swap__after">{after}</span>
  </span>
);

export default StageSwap;
```

- [ ] **Step 5: Write `Spotlight.tsx`**

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useInView } from '../../hooks/useInView';
import type { BandBadge } from '../../landing.config';
import './Spotlight.scss';

export interface SpotlightPoint {
  icon: LucideIcon;
  text: string;
}

interface SpotlightProps {
  id: string;
  /** Eyebrow text after the badge, e.g. "Scrum board". */
  label: string;
  badge: BandBadge;
  /** Heading up to the accented phrase. */
  title: string;
  /** Accented end of the heading. */
  accent: string;
  lead: string;
  points: SpotlightPoint[];
  /** Side the text sits on at desktop widths; the stage takes the other. */
  textSide: 'left' | 'right';
  tone?: 'plain' | 'tinted';
  /** `preview` marks a feature that hasn't shipped. */
  stage?: 'live' | 'preview';
  aside?: { title: string; text: string };
  cta?: { label: string; to: string };
  /** The stage's floating cards. */
  children: React.ReactNode;
}

const BADGE_TEXT = { new: 'New', soon: 'Soon' } as const;

/** One feature band: copy on one side, a decorative stage of floating cards on the other. */
const Spotlight: React.FC<SpotlightProps> = ({
  id,
  label,
  badge,
  title,
  accent,
  lead,
  points,
  textSide,
  tone = 'plain',
  stage = 'live',
  aside,
  cta,
  children,
}) => {
  const [ref, { seen, visible }] = useInView<HTMLElement>();
  const headingId = `${id}-title`;
  const className = [
    'spotlight',
    `spotlight--text-${textSide}`,
    `spotlight--${tone}`,
    seen ? 'is-seen' : '',
    visible ? '' : 'is-offscreen',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section id={id} ref={ref} className={className} aria-labelledby={headingId}>
      <div className="spotlight__inner">
        <div className="spotlight__text">
          <p className={`spotlight__eyebrow${badge === 'soon' ? ' spotlight__eyebrow--soon' : ''}`}>
            {badge && <span className="spotlight__badge">{BADGE_TEXT[badge]}</span>}
            {label}
          </p>
          <h2 id={headingId} className="spotlight__title">
            {title} <span className="spotlight__accent">{accent}</span>
          </h2>
          <p className="spotlight__lead">{lead}</p>
          <ul className="spotlight__points">
            {points.map(({ icon: Icon, text }) => (
              <li key={text} className="spotlight__point">
                <span className="spotlight__point-icon" aria-hidden="true">
                  <Icon size={17} strokeWidth={2} />
                </span>
                {text}
              </li>
            ))}
          </ul>
          {aside && (
            <div className="spotlight__aside">
              <strong className="spotlight__aside-title">{aside.title}</strong>
              <p className="spotlight__aside-text">{aside.text}</p>
            </div>
          )}
          {cta && (
            <Link to={cta.to} className="spotlight__cta">
              {cta.label} <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
        <div className={`spotlight__stage spotlight__stage--${stage}`} aria-hidden="true">
          {children}
        </div>
      </div>
    </section>
  );
};

export default Spotlight;
```

- [ ] **Step 6: Write `Spotlight.scss`**

```scss
@use '@styles/index.scss' as *;

// Spotlight bands: a landing-only marketing surface, like Hero.scss and Solutions.scss.
// A small bespoke palette the app's --gt-* tokens don't carry: the accent gradient's second
// stop, the band and stage backdrop tints, the preview stage's near-white, and two avatar
// colors chosen for 4.5:1 with white initials. The mask gradients' #000 stops set alpha, not
// color. Spec: docs/superpowers/specs/2026-09-24-landing-new-features-design.md.

$accent-end: #02a06b;
$band-tint: #f8faf9;
$stage-tint: #f3f7f5;
$preview-bg: #fbfbfc;
$avatar-blue: #1b57d6;
$avatar-purple: #7d3c98;

.spotlight {
  position: relative;
  padding: clamp(72px, 9vw, 112px) $spacing-lg;
  background: $white;
  border-top: 1px solid var(--gt-gray-100);

  &--tinted {
    background: $band-tint;
    border-top-color: transparent;
  }

  &__inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.08fr);
    gap: clamp(32px, 5vw, 64px);
    align-items: center;
    max-width: 1100px;
    margin: 0 auto;
  }

  &--text-right &__inner {
    grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr);
  }

  &--text-right &__text {
    order: 2;
  }

  // --- Text column: fades up once, children 60ms apart ------------------------------
  &__text > * {
    opacity: 0;
    transform: translateY(16px);
    transition:
      opacity 0.5s ease,
      transform 0.6s cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  @for $i from 2 through 6 {
    &__text > :nth-child(#{$i}) {
      transition-delay: ($i - 1) * 60ms;
    }
  }

  &.is-seen &__text > * {
    opacity: 1;
    transform: none;
  }

  &__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 18px;
    padding: 6px 13px;
    border-radius: 999px;
    background: rgba(1, 129, 86, 0.1);
    color: var(--gt-success-text);
    font-family: $primary-font;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    letter-spacing: 0.04em;
    text-transform: uppercase;

    &--soon {
      background: var(--gt-warning-soft);
      color: var(--gt-warning-text);
    }
  }

  &__badge {
    margin-left: -8px;
    padding: 2px 7px;
    border-radius: 999px;
    background: $primary-color;
    color: $white;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }

  &__eyebrow--soon &__badge {
    background: var(--gt-warning-text);
  }

  &__title {
    margin: 0 0 16px;
    font-family: $primary-font;
    font-size: clamp(2rem, 4vw, 2.5rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: $text-dark;
  }

  &__accent {
    background: linear-gradient(135deg, $primary-color, $accent-end);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  &__lead {
    max-width: 460px;
    margin: 0 0 24px;
    font-family: $primary-font;
    font-size: clamp(15px, 1.3vw, 16.5px);
    line-height: 1.65;
    color: $text-tertiary;
  }

  &__points {
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__point {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: $primary-font;
    font-size: 14.5px;
    font-weight: $font-weight-medium;
    color: $text-secondary;
  }

  &__point-icon {
    display: inline-flex;
    flex: 0 0 34px;
    align-items: center;
    justify-content: center;
    height: 34px;
    border-radius: 10px;
    background: var(--gt-primary-soft);
    color: $primary-color;
  }

  &__aside {
    max-width: 460px;
    margin-top: 22px;
    padding: 14px 16px;
    border-radius: 12px;
    background: $white;
    box-shadow: 0 0 0 1px var(--gt-gray-200);
  }

  &__aside-title {
    display: block;
    margin-bottom: 4px;
    font-family: $primary-font;
    font-size: $font-size-sm;
    font-weight: $font-weight-semibold;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: $text-tertiary;
  }

  &__aside-text {
    margin: 0;
    font-family: $primary-font;
    font-size: $font-size-base;
    line-height: 1.6;
    color: $text-secondary;
  }

  &__cta {
    display: inline-flex;
    gap: 6px;
    margin-top: 20px;
    font-family: $primary-font;
    font-size: 15px;
    font-weight: $font-weight-semibold;
    color: var(--gt-success-text);
    text-decoration: none;

    span {
      display: inline-block;
      transition: transform $transition-fast;
    }

    &:hover span {
      transform: translateX(4px);
    }

    &:focus-visible {
      border-radius: 4px;
    }
  }

  // --- Stage backdrops --------------------------------------------------------------------
  &__stage {
    position: relative;
    height: 470px;
    border-radius: 28px;
    pointer-events: none;

    &--live {
      background:
        radial-gradient(70% 60% at 50% 40%, rgba(1, 129, 86, 0.1), transparent 70%),
        $stage-tint;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background-image: radial-gradient(circle, rgba(33, 43, 54, 0.16) 1.2px, transparent 1.5px);
        background-size: 22px 22px;
        -webkit-mask-image: radial-gradient(80% 80% at 50% 50%, #000 30%, transparent 85%);
        mask-image: radial-gradient(80% 80% at 50% 50%, #000 30%, transparent 85%);
      }
    }

    &--preview {
      background: $preview-bg;
      box-shadow: inset 0 0 0 1.5px var(--gt-gray-300);

      &::after {
        content: 'Preview';
        position: absolute;
        top: 16px;
        left: 18px;
        padding: 3px 9px;
        border: 1.5px dashed var(--gt-gray-400);
        border-radius: 999px;
        font-family: $primary-font;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--gt-gray-500);
      }
    }
  }
}

// --- Floating cards ---------------------------------------------------------------------------
// The hero's card shell. Each stage's stylesheet places a card and sets --tilt, --float-y and
// --float-duration on it.
.stage-card {
  position: absolute;
  padding: 16px;
  border-radius: 20px;
  background: $white;
  box-shadow:
    0 2px 6px rgba(33, 43, 54, 0.04),
    0 24px 48px -12px rgba(33, 43, 54, 0.18);
  font-family: $primary-font;
  color: $text-dark;
  text-align: left;
  rotate: var(--tilt, 0deg);
  opacity: 0;
  transform: translateX(var(--enter-x, 24px));
  transition:
    opacity 0.6s ease,
    transform 0.7s cubic-bezier(0.2, 0.7, 0.2, 1);
  transition-delay: calc(var(--reveal-order, 0) * 80ms + 120ms);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }

  &__title {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 13.5px;
    font-weight: $font-weight-semibold;
    letter-spacing: -0.01em;
  }

  &__meta {
    font-size: 10.5px;
    font-weight: $font-weight-medium;
    color: var(--gt-gray-500);
  }
}

.spotlight--text-right .stage-card {
  --enter-x: -24px;
}

.is-seen .stage-card {
  opacity: 1;
  transform: none;
  animation: stage-float var(--float-duration, 9s) ease-in-out infinite;
}

.is-offscreen .stage-card {
  animation-play-state: paused;
}

@keyframes stage-float {
  0%,
  100% {
    translate: 0 0;
  }
  50% {
    translate: 0 var(--float-y, -10px);
  }
}

// --- Shared widget parts ----------------------------------------------------------------------
.stage-avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px $white;
  color: $white;
  font-size: 8.5px;
  font-weight: $font-weight-semibold;

  &--lg {
    width: 30px;
    height: 30px;
    font-size: 10px;
  }

  &--square {
    border-radius: 9px;
    box-shadow: none;
  }

  &--green {
    background: $primary-color;
  }

  &--blue {
    background: $avatar-blue;
  }

  &--purple {
    background: $avatar-purple;
  }

  &--amber {
    background: var(--gt-warning-text);
  }
}

.stage-pill {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 9.5px;
  font-weight: $font-weight-semibold;
  white-space: nowrap;

  &--green {
    background: var(--gt-success-soft);
    color: var(--gt-success-text);
  }

  &--blue {
    background: var(--gt-info-soft);
    color: var(--gt-info-text);
  }

  &--amber {
    background: var(--gt-warning-soft);
    color: var(--gt-warning-text);
  }
}

// Stacked values that trade places mid-moment; `after` is the resting state.
.stage-swap {
  display: inline-grid;

  > * {
    grid-area: 1 / 1;
  }

  &__before {
    opacity: 0;
  }
}

.is-seen .stage-swap__before {
  animation: stage-swap-out var(--swap-duration, 2.2s) linear var(--swap-delay, 0.9s) both;
}

.is-seen .stage-swap__after {
  animation: stage-swap-in var(--swap-duration, 2.2s) linear var(--swap-delay, 0.9s) both;
}

@keyframes stage-swap-out {
  0%,
  57% {
    opacity: 1;
  }
  62%,
  100% {
    opacity: 0;
  }
}

@keyframes stage-swap-in {
  0%,
  57% {
    opacity: 0;
  }
  62%,
  100% {
    opacity: 1;
  }
}

// --- Narrower screens -------------------------------------------------------------------------
@media (max-width: 1079px) {
  .spotlight__inner,
  .spotlight--text-right .spotlight__inner {
    grid-template-columns: minmax(0, 1fr);
    max-width: 680px;
  }

  .spotlight--text-right .spotlight__text {
    order: 0;
  }

  .spotlight__stage {
    height: 430px;
  }

  .spotlight__stage .stage-card--wide-only {
    display: none;
  }
}

@media (max-width: 767px) {
  .spotlight__stage {
    display: flex;
    justify-content: center;
    height: auto;
    padding: 36px 16px;
  }

  .spotlight__stage .stage-card {
    display: none;
  }

  .spotlight__stage .stage-card.stage-card--mobile {
    display: block;
    position: relative;
    inset: auto;
    width: min(100%, 320px);
    rotate: none;
  }

  .is-seen .spotlight__stage .stage-card--mobile {
    animation: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spotlight__text > *,
  .stage-card {
    opacity: 1;
    transform: none;
    transition: none;
  }

  // Every float and moment stops; the base styles are each band's final frame.
  .spotlight *,
  .spotlight *::before,
  .spotlight *::after {
    animation: none !important;
  }
}
```

- [ ] **Step 7: Run the test and watch it pass**

Run: `npx vitest run src/features/landing/__tests__/Spotlight.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/landing/components/spotlights frontend/src/features/landing/__tests__/Spotlight.test.tsx
git commit -m "feat(landing): spotlight band shell with floating stage cards"
```

---

### Task 3: Band 1, scrum board

**Files:**
- Create: `frontend/src/features/landing/components/spotlights/ScrumSpotlight.tsx`
- Create: `frontend/src/features/landing/components/spotlights/ScrumSpotlight.scss`

(Covered by the page test in Task 8; the stage is decorative.)

- [ ] **Step 1: Write `ScrumSpotlight.tsx`**

```tsx
import React from 'react';
import {
  ArrowRight,
  Clock,
  GitMerge,
  GitPullRequest,
  Hash,
  MessageSquare,
  Move,
  Repeat2,
  TrendingUp,
} from 'lucide-react';
import { BAND_BADGES, SECTION_IDS } from '../../landing.config';
import Spotlight, { type SpotlightPoint } from './Spotlight';
import StageCard from './StageCard';
import StageSwap from './StageSwap';
import './ScrumSpotlight.scss';

const POINTS: SpotlightPoint[] = [
  { icon: Move, text: 'Drag-and-drop board with a history of every move' },
  { icon: Hash, text: "Story points and time estimates, on your team's own scale" },
  { icon: GitPullRequest, text: 'Tasks linked to GitHub and git.ucsc.edu pull requests' },
  { icon: TrendingUp, text: 'Burnup charts for each sprint and the whole project' },
];

interface MiniTaskProps {
  taskKey: string;
  title: string;
  points: number;
  className?: string;
}

const MiniTask: React.FC<MiniTaskProps> = ({ taskKey, title, points, className = '' }) => (
  <span className={`scrum-mini ${className}`.trim()}>
    <span className="scrum-mini__key">
      {taskKey}
      <b>{points}</b>
    </span>
    <span className="scrum-mini__title">{title}</span>
  </span>
);

const ScrumSpotlight: React.FC = () => (
  <Spotlight
    id={SECTION_IDS.scrum}
    label="Scrum board"
    badge={BAND_BADGES.scrum}
    title="Run every sprint from"
    accent="one board"
    lead="Break your project into sprints, user stories and tasks. Drag work across the board, estimate it in points, and link each task to its pull request. Every move is logged, so your TA sees progress as it happens."
    points={POINTS}
    textSide="left"
  >
    <StageCard className="scrum-board-card" order={0}>
      <div className="stage-card__head">
        <span className="stage-card__title">Sprint 3</span>
        <span className="stage-card__meta">4 days left</span>
      </div>
      <div className="scrum-board__cols">
        <div className="scrum-board__col">
          <div className="scrum-board__col-head">
            <span className="scrum-board__dot scrum-board__dot--todo" />
            TODO
            <span className="scrum-board__count">2</span>
          </div>
          <MiniTask taskKey="GT-15" title="Invite flow copy" points={2} />
          <MiniTask taskKey="GT-16" title="Export grades CSV" points={5} />
        </div>
        <div className="scrum-board__col">
          <div className="scrum-board__col-head">
            <span className="scrum-board__dot scrum-board__dot--doing" />
            In Progress
            <span className="scrum-board__count">
              <StageSwap before={2} after={1} />
            </span>
          </div>
          <div className="scrum-board__slot" />
          <MiniTask taskKey="GT-9" title="Attendance tab" points={3} />
        </div>
        <div className="scrum-board__col">
          <div className="scrum-board__col-head">
            <span className="scrum-board__dot scrum-board__dot--done" />
            Done
            <span className="scrum-board__count">
              <StageSwap before={3} after={4} />
            </span>
          </div>
          <div className="scrum-board__slot" />
          <MiniTask taskKey="GT-7" title="Login page" points={2} />
          <MiniTask taskKey="GT-8" title="Team channels" points={3} />
        </div>
        <MiniTask className="scrum-mini--mover" taskKey="GT-12" title="Roster API" points={3} />
      </div>
    </StageCard>

    <StageCard className="scrum-task-card stage-card--mobile" order={1}>
      <div className="scrum-task__top">
        <span className="scrum-task__key">GT-12</span>
        <span className="scrum-task__story">GT-4</span>
        <span className="scrum-task__estimate">
          <Clock size={11} strokeWidth={2.5} />
          6h
        </span>
        <span className="scrum-task__points">3</span>
      </div>
      <p className="scrum-task__title">Connect the class roster API</p>
      <div className="scrum-task__tags">
        <span className="stage-pill stage-pill--green">backend</span>
        <span className="stage-pill stage-pill--blue">frontend</span>
      </div>
      <div className="scrum-task__foot">
        <span className="scrum-task__pair">
          <span className="stage-avatar stage-avatar--purple">PS</span>
          <ArrowRight size={10} strokeWidth={2.5} />
          <span className="stage-avatar stage-avatar--blue">JL</span>
        </span>
        <span className="scrum-task__meta">
          <span className="scrum-task__comments">
            <MessageSquare size={11} strokeWidth={2.5} />4
          </span>
          <span className="scrum-task__pr">
            <GitMerge size={10} strokeWidth={2.5} />
            #41 merged
          </span>
        </span>
      </div>
      <div className="scrum-task__audit">
        <Repeat2 size={11} strokeWidth={2.5} />
        Moved to <b>Done</b> · Jordan · just now
      </div>
    </StageCard>

    <StageCard className="scrum-burnup-card stage-card--wide-only" order={2}>
      <div className="stage-card__head">
        <span className="stage-card__title">Sprint burnup</span>
        <span className="scrum-burnup__stat">
          <strong>18</strong>/24 pts
        </span>
      </div>
      <svg className="scrum-burnup__plot" viewBox="0 0 200 86" preserveAspectRatio="none">
        <line className="scrum-burnup__grid" x1="0" x2="200" y1="21" y2="21" />
        <line className="scrum-burnup__grid" x1="0" x2="200" y1="43" y2="43" />
        <line className="scrum-burnup__grid" x1="0" x2="200" y1="64" y2="64" />
        <polygon
          className="scrum-burnup__area"
          points="0,86 0,78 33,70 66,58 100,44 133,36 166,28 166,86"
        />
        <polyline className="scrum-burnup__scope" points="0,26 66,26 66,14 200,14" />
        <polyline className="scrum-burnup__done" points="0,78 33,70 66,58 100,44 133,36 166,28" />
      </svg>
      <div className="scrum-burnup__legend">
        <span>
          <i className="scrum-burnup__swatch--done" />
          Completed
        </span>
        <span>
          <i className="scrum-burnup__swatch--scope" />
          Scope
        </span>
      </div>
    </StageCard>
  </Spotlight>
);

export default ScrumSpotlight;
```

- [ ] **Step 2: Write `ScrumSpotlight.scss`**

```scss
@use '@styles/index.scss' as *;

// Scrum band stage (landing-only; the shell lives in Spotlight.scss): a small-scale mirror of
// the design system's scrum components. The merged-PR purple is bespoke, kept verbatim from
// the design system's scrum.css, which has no --gt-* token for it either.

$pr-merged: #7d3c98;

.scrum-board-card {
  top: 7%;
  left: 4%;
  z-index: 2;
  width: 360px;
  --tilt: -2deg;
  --float-duration: 8s;
  --float-y: -10px;
}

.scrum-task-card {
  top: 41%;
  right: 3%;
  z-index: 3;
  width: 262px;
  --tilt: 3deg;
  --float-duration: 9s;
  --float-y: 9px;
}

.scrum-burnup-card {
  bottom: 5%;
  left: 12%;
  z-index: 1;
  width: 250px;
  --tilt: -3deg;
  --float-duration: 9.5s;
  --float-y: -8px;
}

// --- Board ------------------------------------------------------------------------------------
.scrum-board {
  &__cols {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }

  &__col {
    min-height: 164px;
    padding: 8px 6px 6px;
    border-radius: 10px;
    background: var(--gt-gray-50);
  }

  &__col-head {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0 2px 7px;
    font-size: 10px;
    font-weight: $font-weight-semibold;
    color: $text-secondary;
  }

  &__dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;

    &--todo {
      background: var(--gt-gray-400);
    }

    &--doing {
      background: var(--gt-accent);
    }

    &--done {
      background: $primary-color;
    }
  }

  &__count {
    margin-left: auto;
    font-size: 9.5px;
    font-weight: $font-weight-semibold;
    color: var(--gt-gray-500);
  }

  &__slot {
    height: 40px;
  }
}

.scrum-mini {
  display: block;
  margin-bottom: 5px;
  padding: 6px 6px 5px;
  border-radius: 7px;
  background: $white;
  box-shadow: 0 0 0 1px var(--gt-gray-200);

  &__key {
    display: flex;
    justify-content: space-between;
    font-family: var(--gt-font-mono);
    font-size: 8.5px;
    color: var(--gt-gray-500);

    b {
      padding: 0 4px;
      border-radius: 4px;
      background: var(--gt-success-soft);
      color: var(--gt-success-text);
      font-weight: 700;
    }
  }

  &__title {
    display: block;
    margin-top: 2px;
    font-size: 9.5px;
    font-weight: $font-weight-medium;
    line-height: 1.3;
    color: $text-dark;
  }

  // GT-12 rests in Done (the still frame); the moment starts it one column to the left.
  &--mover {
    position: absolute;
    top: 30px;
    left: calc((100% - 16px) / 3 * 2 + 16px + 6px);
    z-index: 1;
    width: calc((100% - 16px) / 3 - 12px);
    box-shadow:
      0 0 0 1.5px $primary-color,
      0 8px 18px -8px rgba(1, 129, 86, 0.45);
  }
}

.is-seen .scrum-mini--mover {
  animation: scrum-move 2.2s cubic-bezier(0.65, 0, 0.35, 1) 0.9s both;
}

@keyframes scrum-move {
  0%,
  20% {
    transform: translateX(calc(-100% - 20px));
    box-shadow:
      0 0 0 1.5px var(--gt-accent),
      0 8px 18px -6px rgba(39, 113, 255, 0.45);
  }
  38% {
    transform: translateX(calc(-50% - 10px)) translateY(-6px) rotate(2deg);
  }
  55%,
  100% {
    transform: none;
    box-shadow:
      0 0 0 1.5px $primary-color,
      0 8px 18px -8px rgba(1, 129, 86, 0.45);
  }
}

// --- Task card --------------------------------------------------------------------------------
.scrum-task {
  &__top {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
  }

  &__key {
    font-family: var(--gt-font-mono);
    font-size: 10.5px;
    font-weight: $font-weight-semibold;
    color: $text-tertiary;
  }

  &__story {
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--gt-gray-100);
    font-family: var(--gt-font-mono);
    font-size: 9.5px;
    color: $text-tertiary;
  }

  &__estimate {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: auto;
    font-size: 10px;
    color: $text-tertiary;
  }

  &__points {
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--gt-success-soft);
    font-family: var(--gt-font-mono);
    font-size: 10.5px;
    font-weight: 700;
    color: var(--gt-success-text);
  }

  &__title {
    margin: 0 0 9px;
    font-size: 13.5px;
    font-weight: $font-weight-semibold;
    line-height: 1.35;
  }

  &__tags {
    display: flex;
    gap: 5px;
    margin-bottom: 11px;
  }

  &__foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__pair {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--gt-gray-500);
  }

  &__meta {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  &__comments {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    color: $text-tertiary;
  }

  &__pr {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    background: rgba($pr-merged, 0.12);
    font-size: 10px;
    font-weight: $font-weight-semibold;
    color: $pr-merged;
  }

  &__audit {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 10px;
    padding-top: 9px;
    border-top: 1px dashed var(--gt-gray-200);
    font-size: 10px;
    color: $text-tertiary;

    b {
      font-weight: $font-weight-semibold;
      color: var(--gt-success-text);
    }
  }
}

// --- Burnup -----------------------------------------------------------------------------------
.scrum-burnup {
  &__stat {
    font-size: 11px;
    color: $text-tertiary;

    strong {
      font-size: 13px;
      color: $text-dark;
    }
  }

  &__plot {
    display: block;
    width: 100%;
    height: 86px;
  }

  &__grid {
    stroke: var(--gt-gray-100);
  }

  &__area {
    fill: rgba(1, 129, 86, 0.1);
  }

  &__scope {
    fill: none;
    stroke: var(--gt-gray-500);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
  }

  &__done {
    fill: none;
    stroke: $primary-color;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 260;
    stroke-dashoffset: 0;
  }

  &__legend {
    display: flex;
    gap: 12px;
    margin-top: 6px;
    font-size: 9.5px;
    color: $text-tertiary;

    i {
      display: inline-block;
      width: 10px;
      height: 3px;
      margin-right: 4px;
      border-radius: 2px;
      vertical-align: middle;
    }
  }

  &__swatch--done {
    background: $primary-color;
  }

  &__swatch--scope {
    background: var(--gt-gray-500);
  }
}

.is-seen .scrum-burnup__done {
  animation: scrum-draw 2.2s ease 0.9s both;
}

@keyframes scrum-draw {
  0%,
  30% {
    stroke-dashoffset: 260;
  }
  90%,
  100% {
    stroke-dashoffset: 0;
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: no output (exit 0).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/landing/components/spotlights/ScrumSpotlight.*
git commit -m "feat(landing): scrum board band"
```

---

### Task 4: Band 2, messaging

**Files:**
- Create: `frontend/src/features/landing/components/spotlights/MessagingSpotlight.tsx`
- Create: `frontend/src/features/landing/components/spotlights/MessagingSpotlight.scss`

- [ ] **Step 1: Write `MessagingSpotlight.tsx`**

```tsx
import React from 'react';
import { Bell, MessageSquare, Send, Shuffle, Users } from 'lucide-react';
import { BAND_BADGES, SECTION_IDS } from '../../landing.config';
import Spotlight, { type SpotlightPoint } from './Spotlight';
import StageCard from './StageCard';
import StageSwap from './StageSwap';
import './MessagingSpotlight.scss';

const POINTS: SpotlightPoint[] = [
  { icon: Users, text: 'Team, TA and Instructor channels for every project' },
  { icon: MessageSquare, text: 'Direct messages with classmates and course staff' },
  { icon: Shuffle, text: "Channels follow the roster: join a team and you're in" },
  { icon: Bell, text: 'Live notifications for messages, join requests and team changes' },
];

interface ConversationProps {
  initials: string;
  tone: 'green' | 'blue' | 'amber' | 'purple';
  /** Channels use a square avatar; people a round one. */
  square?: boolean;
  name: string;
  channel?: { label: string; tone: 'green' | 'blue' | 'amber' };
  preview: React.ReactNode;
  time: string;
  unread?: React.ReactNode;
  active?: boolean;
}

const Conversation: React.FC<ConversationProps> = ({
  initials,
  tone,
  square = false,
  name,
  channel,
  preview,
  time,
  unread,
  active = false,
}) => (
  <div className={`msg-conv${active ? ' msg-conv--active' : ''}`}>
    <span
      className={`stage-avatar stage-avatar--lg stage-avatar--${tone}${square ? ' stage-avatar--square' : ''}`}
    >
      {initials}
    </span>
    <span className="msg-conv__body">
      <span className="msg-conv__name">
        {name}
        {channel && <span className={`stage-pill stage-pill--${channel.tone}`}>{channel.label}</span>}
      </span>
      <span className="msg-conv__preview">{preview}</span>
    </span>
    <span className="msg-conv__side">
      <span className="msg-conv__time">{time}</span>
      {unread && <span className="msg-conv__unread">{unread}</span>}
    </span>
  </div>
);

const MessagingSpotlight: React.FC = () => (
  <Spotlight
    id={SECTION_IDS.messaging}
    label="Messaging"
    badge={BAND_BADGES.messaging}
    title="One inbox for your team and"
    accent="course staff"
    lead="Every project gets three channels: one for the team, one with your TA and one with your instructor. Direct messages cover everything else. Messages and notifications arrive live, with unread counts wherever you are in the app."
    points={POINTS}
    textSide="right"
    tone="tinted"
  >
    <StageCard className="msg-inbox-card" order={0}>
      <div className="stage-card__head">
        <span className="stage-card__title">Messages</span>
        <span className="stage-card__meta">
          <StageSwap before="2 unread" after="3 unread" />
        </span>
      </div>
      <Conversation
        active
        initials="SS"
        tone="green"
        square
        name="ShoeShopper"
        channel={{ label: 'Team', tone: 'green' }}
        preview={<StageSwap before="Standup moved to 3pm" after="Jordan: Merged, thanks!" />}
        time="2m"
        unread={<StageSwap before={2} after={3} />}
      />
      <Conversation
        initials="SS"
        tone="blue"
        square
        name="ShoeShopper"
        channel={{ label: 'TA', tone: 'blue' }}
        preview="Great demo today, see notes"
        time="1h"
      />
      <Conversation
        initials="SS"
        tone="amber"
        square
        name="ShoeShopper"
        channel={{ label: 'Instructor', tone: 'amber' }}
        preview="Final review slot confirmed"
        time="Tue"
      />
      <Conversation initials="PS" tone="purple" name="Priya Shah" preview="Can you look at my PR?" time="Mon" />
    </StageCard>

    <StageCard className="msg-thread-card stage-card--mobile" order={1}>
      <div className="stage-card__head">
        <span className="stage-card__title">
          ShoeShopper <span className="stage-pill stage-pill--green">Team</span>
        </span>
        <span className="stage-card__meta">5 members</span>
      </div>
      <div className="msg-thread">
        <div className="msg-row">
          <span className="stage-avatar stage-avatar--purple">PS</span>
          <div className="msg-bubble">
            Can someone review GT-12 before standup?<small>Priya · 10:02</small>
          </div>
        </div>
        <div className="msg-row msg-row--mine">
          <div className="msg-bubble msg-bubble--mine">
            On it. PR #41 is up.<small>You · 10:04</small>
          </div>
        </div>
        {/* One row for Jordan: the avatar arrives with the typing dots and stays when the reply lands. */}
        <div className="msg-row msg-row--live">
          <span className="stage-avatar stage-avatar--blue">JL</span>
          <div className="msg-live">
            <span className="msg-live__typing">
              <i />
              <i />
              <i />
            </span>
            <div className="msg-bubble msg-live__landed">
              Merged, thanks!<small>Jordan · 10:09</small>
            </div>
          </div>
        </div>
      </div>
      <div className="msg-composer">
        Message the team…
        <span className="msg-composer__send">
          <Send size={12} strokeWidth={2.5} />
        </span>
      </div>
    </StageCard>
  </Spotlight>
);

export default MessagingSpotlight;
```

- [ ] **Step 2: Write `MessagingSpotlight.scss`**

```scss
@use '@styles/index.scss' as *;

// Messaging band stage (landing-only; the shell lives in Spotlight.scss). Mirrors the app's
// ConversationListItem and MessageBubble; every color here is a token.

.msg-inbox-card,
.msg-thread-card {
  --swap-duration: 2.4s;
  --swap-delay: 1.2s;
}

.msg-inbox-card {
  top: 8%;
  left: 5%;
  z-index: 1;
  width: 318px;
  --tilt: -2deg;
  --float-duration: 8s;
  --float-y: -10px;
}

.msg-thread-card {
  top: 37%;
  right: 4%;
  z-index: 2;
  width: 300px;
  --tilt: 2.5deg;
  --float-duration: 9s;
  --float-y: 9px;
}

// --- Inbox ------------------------------------------------------------------------------------
.msg-conv {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-radius: 10px;

  & + & {
    margin-top: 2px;
  }

  &--active {
    background: var(--gt-gray-50);
  }

  &__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  &__name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: $font-weight-semibold;
  }

  &__preview {
    margin-top: 1px;
    overflow: hidden;
    font-size: 11px;
    color: $text-tertiary;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  &__side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
  }

  &__time {
    font-size: 9.5px;
    color: var(--gt-gray-500);
  }

  &__unread {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 17px;
    height: 17px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--gt-error-text);
    color: $white;
    font-size: 9.5px;
    font-weight: 700;
  }
}

// --- Thread -----------------------------------------------------------------------------------
.msg-thread {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 150px;
}

.msg-row {
  display: flex;
  align-items: flex-end;
  gap: 7px;

  &--mine {
    justify-content: flex-end;
  }

  &--live {
    overflow: hidden;
  }
}

.msg-bubble {
  max-width: 190px;
  padding: 8px 11px;
  border-radius: 14px 14px 14px 4px;
  background: var(--gt-gray-100);
  font-size: 11.5px;
  line-height: 1.45;
  color: $text-dark;

  small {
    display: block;
    margin-top: 2px;
    font-size: 9px;
    opacity: 0.7;
  }

  &--mine {
    border-radius: 14px 14px 4px 14px;
    background: $primary-color;
    color: $white;
  }
}

.msg-live {
  display: flex;
  flex-direction: column;
  align-items: flex-start;

  // Resting state: the reply has landed and the dots are gone.
  &__typing {
    display: inline-flex;
    gap: 3px;
    max-height: 0;
    overflow: hidden;
    padding: 0 11px;
    border-radius: 14px 14px 14px 4px;
    background: var(--gt-gray-100);
    opacity: 0;

    i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--gt-gray-500);
      animation: msg-blink 1.2s infinite;
    }

    i:nth-child(2) {
      animation-delay: 0.2s;
    }

    i:nth-child(3) {
      animation-delay: 0.4s;
    }
  }

  &__landed {
    overflow: hidden;
    transform-origin: bottom left;
  }
}

.is-seen .msg-row--live {
  animation: msg-row-in 2.4s ease 0.9s both;
}

.is-seen .msg-live__typing {
  animation: msg-typing 2.4s ease 0.9s both;
}

.is-seen .msg-live__landed {
  animation: msg-land 2.4s ease 0.9s both;
}

@keyframes msg-blink {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@keyframes msg-row-in {
  0% {
    opacity: 0;
    max-height: 0;
  }
  12%,
  100% {
    opacity: 1;
    max-height: 80px;
  }
}

@keyframes msg-typing {
  0%,
  10% {
    opacity: 0;
    max-height: 0;
    padding: 0 11px;
  }
  16%,
  62% {
    opacity: 1;
    max-height: 30px;
    padding: 9px 11px;
  }
  68%,
  100% {
    opacity: 0;
    max-height: 0;
    padding: 0 11px;
  }
}

@keyframes msg-land {
  0%,
  64% {
    opacity: 0;
    transform: scale(0.9);
    max-height: 0;
    padding: 0 11px;
  }
  74%,
  100% {
    opacity: 1;
    transform: none;
    max-height: 60px;
    padding: 8px 11px;
  }
}

.msg-composer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 12px;
  box-shadow: 0 0 0 1px var(--gt-gray-200);
  font-size: 11px;
  color: var(--gt-gray-500);

  &__send {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-left: auto;
    border-radius: 8px;
    background: $primary-color;
    color: $white;
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/landing/components/spotlights/MessagingSpotlight.*
git commit -m "feat(landing): messaging band"
```

---

### Task 5: Band 3, project assistant

**Files:**
- Create: `frontend/src/features/landing/components/spotlights/AssistantSpotlight.tsx`
- Create: `frontend/src/features/landing/components/spotlights/AssistantSpotlight.scss`

- [ ] **Step 1: Write `AssistantSpotlight.tsx`**

```tsx
import React from 'react';
import { Check, CircleAlert, Clock, GitPullRequest, ShieldCheck, Sparkles } from 'lucide-react';
import { BAND_BADGES, SECTION_IDS } from '../../landing.config';
import Spotlight, { type SpotlightPoint } from './Spotlight';
import StageCard from './StageCard';
import StageSwap from './StageSwap';
import './AssistantSpotlight.scss';

const POINTS: SpotlightPoint[] = [
  { icon: GitPullRequest, text: 'Suggests board moves from merged PRs and commits' },
  { icon: Clock, text: 'Flags stalled tasks and PRs with no task' },
  { icon: ShieldCheck, text: 'Proposes changes, never makes them on its own' },
];

const AssistantSpotlight: React.FC = () => (
  <Spotlight
    id={SECTION_IDS.assistant}
    label="Project assistant"
    badge={BAND_BADGES.assistant}
    title="A board that keeps up with"
    accent="your code"
    lead="The assistant will read your pull requests and commits and suggest the board updates they imply: move a task to Done when its PR merges, flag work that has stalled, link PRs that aren't on the board. Nothing changes until someone on the team approves it."
    points={POINTS}
    textSide="left"
    stage="preview"
    aside={{
      title: 'For TAs and instructors',
      text: "Each week it compares status reports with the tasks and PRs each student actually closed, and points out where they don't line up, so reviews start from evidence.",
    }}
    cta={{ label: 'Want early access? Get in touch', to: '/contact' }}
  >
    <StageCard className="assist-stall-card stage-card--wide-only" order={0}>
      <span className="assist-flag">
        <i />
        Stalled
      </span>
      <p className="assist-stall__title">
        <code>GT-9</code>Attendance tab
      </p>
      <p className="assist-stall__detail">In Progress for 6 days · no commits</p>
      <span className="assist-link">Nudge Sam →</span>
    </StageCard>

    <StageCard className="assist-suggest-card stage-card--mobile" order={1}>
      <div className="stage-card__head">
        <span className="stage-card__title">
          <span className="assist-mark">
            <Sparkles size={14} strokeWidth={2} />
          </span>
          Project assistant
        </span>
        <span className="stage-card__meta">just now</span>
      </div>
      <p className="assist-suggest__text">
        PR <b>#41</b> was merged into main. Move this task to Done?
      </p>
      <div className="assist-task">
        <code>GT-12</code>
        Connect the class roster API
        <StageSwap className="assist-task__target" before="→ Done" after="Moved to Done" />
      </div>
      <div className="assist-actions">
        <StageSwap
          before={<span className="assist-btn assist-btn--primary">Approve</span>}
          after={
            <span className="assist-btn assist-btn--done">
              <Check size={12} strokeWidth={2.75} />
              Approved
            </span>
          }
        />
        <span className="assist-btn assist-btn--ghost">Dismiss</span>
      </div>
    </StageCard>

    <StageCard className="assist-report-card" order={2}>
      <div className="stage-card__head">
        <span className="stage-card__title">Week 5 status reports</span>
        <span className="stage-card__meta">ShoeShopper</span>
      </div>
      <div className="assist-report__row">
        <span className="assist-check assist-check--ok">
          <Check size={11} strokeWidth={3} />
        </span>
        4 reports match closed work
      </div>
      <div className="assist-report__row">
        <span className="assist-check assist-check--warn">
          <CircleAlert size={11} strokeWidth={2.75} />
        </span>
        Alex: reports 35%, closed 1 of 6 tasks
        <span className="stage-pill stage-pill--amber assist-report__review">Review</span>
      </div>
    </StageCard>

    <StageCard className="assist-chip-card stage-card--wide-only" order={3}>
      <GitPullRequest size={12} strokeWidth={2.5} className="assist-chip__icon" />
      <b>PR #44</b> isn&apos;t on the board · <span className="assist-link">Add task</span>
    </StageCard>
  </Spotlight>
);

export default AssistantSpotlight;
```

- [ ] **Step 2: Write `AssistantSpotlight.scss`**

```scss
@use '@styles/index.scss' as *;

// Project assistant band stage (landing-only; the shell lives in Spotlight.scss). Placeholder
// widgets until Claude Design delivers the assistant's components (see the handoff in
// docs/superpowers/handoffs/2026-09-24-landing-claude-design/). The PR purple is bespoke, kept
// verbatim from the design system's scrum.css.

$pr-purple: #7d3c98;

.assist-suggest-card {
  top: 24%;
  left: 5%;
  z-index: 2;
  width: 296px;
  --tilt: -2deg;
  --float-duration: 8s;
  --float-y: -10px;
  --swap-duration: 2.4s;
  --swap-delay: 1.2s;
}

.assist-stall-card {
  top: 5%;
  right: 4%;
  z-index: 1;
  width: 226px;
  --tilt: 3deg;
  --float-duration: 9s;
  --float-y: 9px;
}

.assist-report-card {
  right: 4%;
  bottom: 6%;
  z-index: 3;
  width: 272px;
  --tilt: -2.5deg;
  --float-duration: 9.5s;
  --float-y: -8px;
}

.assist-chip-card {
  bottom: 5%;
  left: 4%;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 13px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: $font-weight-medium;
  color: $text-secondary;
  white-space: nowrap;
  --tilt: 2deg;
  --float-duration: 10s;
  --float-y: 9px;

  b {
    font-weight: $font-weight-semibold;
    color: $pr-purple;
  }
}

.assist-chip__icon {
  color: $pr-purple;
}

// --- Suggestion -------------------------------------------------------------------------------
.assist-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: var(--gt-primary-soft);
  color: $primary-color;
}

.assist-suggest__text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.5;
  color: $text-secondary;
}

.assist-task {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 12px;
  padding: 7px 9px;
  border-radius: 10px;
  background: var(--gt-gray-50);
  font-size: 11.5px;
  font-weight: $font-weight-semibold;
  color: $text-dark;

  code {
    font-family: var(--gt-font-mono);
    font-size: 10px;
    color: $text-tertiary;
  }

  &__target {
    margin-left: auto;
    white-space: nowrap;

    > * {
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--gt-success-soft);
      color: var(--gt-success-text);
      font-size: 9.5px;
      font-weight: $font-weight-semibold;
    }
  }
}

.assist-actions {
  display: flex;
  gap: 8px;
}

.assist-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 9px;
  font-size: 11.5px;
  font-weight: $font-weight-semibold;

  &--primary {
    background: $primary-color;
    color: $white;
  }

  &--done {
    background: var(--gt-success-soft);
    color: var(--gt-success-text);
  }

  // Resting state: dismissed from view once the suggestion is approved.
  &--ghost {
    box-shadow: 0 0 0 1px var(--gt-gray-300);
    color: $text-tertiary;
    opacity: 0;
  }
}

.is-seen .assist-btn--primary {
  animation: assist-press 2.4s ease 1.2s both;
}

.is-seen .assist-btn--ghost {
  animation: assist-dismiss-out 2.4s ease 1.2s both;
}

@keyframes assist-press {
  0%,
  42% {
    box-shadow: none;
    transform: none;
  }
  48% {
    box-shadow: 0 0 0 3px rgba(1, 129, 86, 0.25);
    transform: translateY(0.5px);
  }
  54%,
  100% {
    box-shadow: none;
    transform: none;
  }
}

@keyframes assist-dismiss-out {
  0%,
  57% {
    opacity: 1;
  }
  64%,
  100% {
    opacity: 0;
  }
}

// --- Stalled flag -----------------------------------------------------------------------------
.assist-flag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--gt-warning-text);

  i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--gt-warning-text);
  }
}

.assist-stall {
  &__title {
    margin: 8px 0 3px;
    font-size: 12.5px;
    font-weight: $font-weight-semibold;

    code {
      margin-right: 5px;
      font-family: var(--gt-font-mono);
      font-size: 10px;
      color: $text-tertiary;
    }
  }

  &__detail {
    margin: 0 0 8px;
    font-size: 11px;
    color: $text-tertiary;
  }
}

.assist-link {
  font-size: 11px;
  font-weight: $font-weight-semibold;
  color: var(--gt-success-text);
}

// --- Report check -----------------------------------------------------------------------------
.assist-report {
  &__row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 0;
    font-size: 11.5px;
    color: $text-secondary;

    & + & {
      border-top: 1px solid var(--gt-gray-100);
    }
  }

  &__review {
    margin-left: auto;
  }
}

.assist-check {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;

  &--ok {
    background: var(--gt-success-soft);
    color: var(--gt-success-text);
  }

  &--warn {
    background: var(--gt-warning-soft);
    color: var(--gt-warning-text);
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/landing/components/spotlights/AssistantSpotlight.*
git commit -m "feat(landing): project assistant band (coming soon)"
```

---

### Task 6: Closing band

**Files:**
- Create: `frontend/src/features/landing/components/ClosingBand.tsx`
- Create: `frontend/src/features/landing/components/ClosingBand.scss`

- [ ] **Step 1: Write `ClosingBand.tsx`**

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import './ClosingBand.scss';

/** Last call to action before the footer. */
const ClosingBand: React.FC = () => (
  <section className="closing-band" aria-labelledby="closing-band-title">
    <div className="closing-band__inner">
      <h2 id="closing-band-title" className="closing-band__title">
        Ready to run your class on grepthink?
      </h2>
      <p className="closing-band__text">
        Create a class and import your roster. Every team gets a scrum board and its own channels
        from day one.
      </p>
      <div className="closing-band__actions">
        <Link to="/select" className="closing-band__primary">
          Get started
        </Link>
        <Link to="/contact" className="closing-band__secondary">
          Talk to us
        </Link>
      </div>
    </div>
  </section>
);

export default ClosingBand;
```

- [ ] **Step 2: Write `ClosingBand.scss`**

```scss
@use '@styles/index.scss' as *;

// Closing call-to-action band (landing-only). Its deep green is bespoke, left as raw hex: it
// sits between the header's dark green and the brand green, and no --gt-* token matches it.
// The mask's #000 stop sets alpha, not color.

$closing-bg: #0f2a20;
$glow: #02a06b;

.closing-band {
  padding: 0 $spacing-lg clamp(64px, 8vw, 104px);
  background: $white;

  &__inner {
    position: relative;
    overflow: hidden;
    max-width: 1100px;
    margin: 0 auto;
    padding: clamp(48px, 6vw, 72px) clamp(24px, 5vw, 56px);
    border-radius: 24px;
    background:
      radial-gradient(70% 90% at 50% 0%, rgba($glow, 0.35), transparent 70%),
      $closing-bg;
    color: $white;
    text-align: center;

    &::before {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image: radial-gradient(circle, rgba(255, 255, 255, 0.14) 1px, transparent 1.3px);
      background-size: 20px 20px;
      -webkit-mask-image: radial-gradient(80% 90% at 50% 100%, #000 10%, transparent 75%);
      mask-image: radial-gradient(80% 90% at 50% 100%, #000 10%, transparent 75%);
    }
  }

  &__title {
    position: relative;
    margin: 0 0 12px;
    font-family: $primary-font;
    font-size: clamp(1.75rem, 3.6vw, 2.25rem);
    font-weight: 700;
    line-height: 1.12;
    letter-spacing: -0.02em;
  }

  &__text {
    position: relative;
    max-width: 480px;
    margin: 0 auto 26px;
    font-family: $primary-font;
    font-size: $font-size-large;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.78);
  }

  &__actions {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 14px;
  }

  &__primary,
  &__secondary {
    display: inline-flex;
    align-items: center;
    padding: 12px 26px;
    border-radius: 10px;
    font-family: $primary-font;
    font-size: $font-size-large;
    font-weight: $font-weight-semibold;
    text-decoration: none;
    transition:
      transform $transition-fast,
      background $transition-fast,
      box-shadow $transition-fast;

    &:active {
      transform: translateY(0.5px);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--gt-focus-ring);
    }
  }

  &__primary {
    background: $primary-color;
    box-shadow: 0 10px 26px -8px rgba($glow, 0.8);
    color: $white;

    &:hover {
      background: $primary-hover;
      color: $white;
    }
  }

  &__secondary {
    box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.35);
    color: $white;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: $white;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .closing-band__primary,
  .closing-band__secondary {
    transition: none;
  }
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc -b` (expect exit 0), then:
```bash
git add frontend/src/features/landing/components/ClosingBand.*
git commit -m "feat(landing): closing call-to-action band"
```

---

### Task 7: Hero announcement pill

**Files:**
- Modify: `frontend/src/features/landing/components/Hero.tsx` (whole file)
- Modify: `frontend/src/features/landing/components/Hero.scss` (eyebrow color; new announce block after `&__eyebrow`)
- Test: `frontend/src/features/landing/__tests__/Hero.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Hero from '../components/Hero';

const renderHero = (props: Parameters<typeof Hero>[0] = {}) =>
  render(
    <MemoryRouter>
      <Hero {...props} />
    </MemoryRouter>,
  );

describe('Hero', () => {
  it('announces the launch with a pill that jumps to the scrum board band', () => {
    renderHero();
    const pill = screen.getByRole('link', { name: /New: Scrum boards and team channels/ });
    expect(pill).toHaveAttribute('href', '/#scrum-board');
    expect(screen.queryByText('For instructors and student teams')).not.toBeInTheDocument();
    expect(screen.getByText(/helps instructors and student teams form balanced teams/)).toBeInTheDocument();
  });

  it('goes back to the plain eyebrow and subtitle without an announcement', () => {
    renderHero({ announcement: null });
    expect(screen.queryByRole('link', { name: /^New:/ })).not.toBeInTheDocument();
    expect(screen.getByText('For instructors and student teams')).toBeInTheDocument();
    expect(screen.getByText(/grepthink helps classes form balanced teams/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/landing/__tests__/Hero.test.tsx`
Expected: FAIL: no link named "New: Scrum boards and team channels".

- [ ] **Step 3: Replace `Hero.tsx`**

```tsx
import React from 'react';
import { Link } from 'react-router-dom';
import FloatingCards from './FloatingCards';
import { ANNOUNCEMENT, sectionLink, type Announcement } from '../landing.config';
import './Hero.scss';

interface HeroProps {
  /** Launch announcement shown in place of the eyebrow; null restores the eyebrow. */
  announcement?: Announcement | null;
}

const Hero: React.FC<HeroProps> = ({ announcement = ANNOUNCEMENT }) => {
  return (
    <section className="hero">
      <FloatingCards />

      <div className="hero__content">
        {announcement ? (
          <Link
            to={sectionLink(announcement.targetId)}
            className="hero__announce"
            aria-label={`New: ${announcement.label}. Jump to the section`}
          >
            <span className="hero__announce-badge">New</span>
            {announcement.label}
            <span className="hero__announce-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ) : (
          <span className="hero__eyebrow">For instructors and student teams</span>
        )}

        <h1 className="hero__title">
          Build better project teams,
          <br />
          <span className="hero__title-accent">all in one place</span>
        </h1>

        <p className="hero__subtitle">
          {announcement
            ? 'grepthink helps instructors and student teams form balanced teams, track weekly progress, and keep everyone accountable without the spreadsheet chaos.'
            : 'grepthink helps classes form balanced teams, track weekly progress, and keep everyone accountable without the spreadsheet chaos.'}
        </p>

        <div className="hero__actions">
          <Link to="/select" className="hero__cta">
            Get started
          </Link>
          <Link to="/login" className="hero__signin">
            Sign in <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default Hero;
```

- [ ] **Step 4: Update `Hero.scss`**

In `&__eyebrow`, change `color: $primary-color;` to:
```scss
    // --gt-success-text on the green tint is 6.3:1; the brand green there was only ~4.3:1.
    color: var(--gt-success-text);
```
Then insert after the closing brace of `&__eyebrow { … }`:
```scss
  &__announce {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    margin-bottom: $spacing-lg;
    padding: 5px 14px 5px 5px;
    border-radius: 999px;
    background: $white;
    box-shadow:
      0 0 0 1px rgba(1, 129, 86, 0.25),
      0 8px 20px -10px rgba(1, 129, 86, 0.45);
    font-family: $primary-font;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    color: $text-secondary;
    text-decoration: none;
    transition: box-shadow $transition-fast;

    &:hover {
      box-shadow:
        0 0 0 1px rgba(1, 129, 86, 0.45),
        0 10px 24px -10px rgba(1, 129, 86, 0.55);

      .hero__announce-arrow {
        transform: translateX(3px);
      }
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--gt-focus-ring);
    }
  }

  &__announce-badge {
    padding: 3px 9px;
    border-radius: 999px;
    background: $primary-color;
    color: $white;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  &__announce-arrow {
    display: inline-block;
    color: var(--gt-success-text);
    font-weight: $font-weight-semibold;
    transition: transform $transition-fast;
  }
```
And add `.hero__announce, .hero__announce-arrow` to the existing `prefers-reduced-motion` block's transition reset.

- [ ] **Step 5: Run the test and watch it pass**

Run: `npx vitest run src/features/landing/__tests__/Hero.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/landing/components/Hero.* frontend/src/features/landing/__tests__/Hero.test.tsx
git commit -m "feat(landing): hero announcement pill for the launch"
```

---

### Task 8: Page composition, navigation anchors and scroll-to-hash

**Files:**
- Modify: `frontend/src/features/landing/LandingPage.tsx` (whole file)
- Modify: `frontend/src/features/landing/LandingPage.scss`
- Modify: `frontend/src/features/landing/components/Header.tsx` (nav)
- Modify: `frontend/src/features/landing/components/Header.scss` (hide "Features" on phones)
- Modify: `frontend/src/features/landing/components/Footer.tsx` (Product column)
- Test: `frontend/src/features/landing/__tests__/LandingPage.test.tsx`

- [ ] **Step 1: Write the failing page test**

```tsx
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import LandingPage from '../LandingPage';

const originalScrollIntoView = Element.prototype.scrollIntoView;
let scrolledTo: Element[] = [];

beforeEach(() => {
  scrolledTo = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolledTo.push(this);
  };
});

afterEach(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

const renderAt = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LandingPage />
    </MemoryRouter>,
  );

describe('LandingPage', () => {
  it('shows the three feature bands after the overview, in order', () => {
    const { container } = renderAt();
    const ids = Array.from(container.querySelectorAll('section[id]')).map((section) => section.id);
    expect(ids).toEqual(['solutions', 'scrum-board', 'messaging', 'project-assistant']);
    expect(screen.getByRole('heading', { level: 2, name: 'Run every sprint from one board' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'One inbox for your team and course staff' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'A board that keeps up with your code' })).toBeInTheDocument();
  });

  it('badges scrum and messaging as new and the assistant as coming soon', () => {
    renderAt();
    expect(within(screen.getByRole('region', { name: 'Run every sprint from one board' })).getByText('New')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'One inbox for your team and course staff' })).getByText('New')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'A board that keeps up with your code' })).getByText('Soon')).toBeInTheDocument();
  });

  it('keeps every stage out of the accessibility tree', () => {
    const { container } = renderAt();
    const stages = container.querySelectorAll('.spotlight__stage');
    expect(stages).toHaveLength(3);
    stages.forEach((stage) => expect(stage).toHaveAttribute('aria-hidden', 'true'));
  });

  it('ends with the closing band', () => {
    renderAt();
    const band = screen.getByRole('region', { name: 'Ready to run your class on grepthink?' });
    expect(within(band).getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/select');
    expect(within(band).getByRole('link', { name: 'Talk to us' })).toHaveAttribute('href', '/contact');
  });

  it('links the header and footer to the bands', () => {
    renderAt();
    expect(screen.getByRole('link', { name: 'Features' })).toHaveAttribute('href', '/#scrum-board');
    const footer = screen.getByRole('navigation', { name: 'Footer' });
    expect(within(footer).getByRole('link', { name: 'Solutions' })).toHaveAttribute('href', '/#solutions');
    expect(within(footer).getByRole('link', { name: 'Scrum board' })).toHaveAttribute('href', '/#scrum-board');
    expect(within(footer).getByRole('link', { name: 'Messaging' })).toHaveAttribute('href', '/#messaging');
    expect(within(footer).getByRole('link', { name: 'Project assistant' })).toHaveAttribute('href', '/#project-assistant');
  });

  it('scrolls to the section named in the URL hash', () => {
    renderAt('/#messaging');
    expect(scrolledTo).toEqual([document.getElementById('messaging')]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/landing/__tests__/LandingPage.test.tsx`
Expected: FAIL: the section ids stop at `['solutions']`.

- [ ] **Step 3: Replace `LandingPage.tsx`**

```tsx
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import Solutions from './components/Solutions';
import ScrumSpotlight from './components/spotlights/ScrumSpotlight';
import MessagingSpotlight from './components/spotlights/MessagingSpotlight';
import AssistantSpotlight from './components/spotlights/AssistantSpotlight';
import ClosingBand from './components/ClosingBand';
import Footer from './components/Footer';
import './LandingPage.scss';

const LandingPage: React.FC = () => {
  const { hash, key } = useLocation();

  // React Router doesn't scroll to hashes; the header, footer and hero pill link here with one.
  // `key` changes on every navigation, so following the same link twice scrolls again.
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (!target) return;
    const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [hash, key]);

  return (
    <div className="landing">
      <Header />
      <main>
        <Hero />
        <Solutions />
        <ScrumSpotlight />
        <MessagingSpotlight />
        <AssistantSpotlight />
        <ClosingBand />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
```

- [ ] **Step 4: Offset anchored sections below the fixed header (`LandingPage.scss`)**

Inside `.landing { … }`, after the `main { display: block; }` block, add:
```scss
  // Anchored sections land below the fixed header (its floating pill is ~64px plus margin).
  section[id] {
    scroll-margin-top: 88px;
  }
```

- [ ] **Step 5: Add "Features" to the header nav (`Header.tsx`)**

Add the import:
```tsx
import { SECTION_IDS, sectionLink } from '../landing.config';
```
and insert, as the first child of `<nav className="landing-header__nav" …>`:
```tsx
          <Link
            to={sectionLink(SECTION_IDS.scrum)}
            className="landing-header__link landing-header__link--features"
          >
            Features
          </Link>
```

- [ ] **Step 6: Hide "Features" on phones (`Header.scss`)**

Append:
```scss
// Phones scroll into the bands anyway; the nav keeps its three essentials.
@media (max-width: 560px) {
  .landing-header__link--features {
    display: none;
  }
}
```

- [ ] **Step 7: Link the footer's Product column to the sections (`Footer.tsx`)**

Add the import:
```tsx
import { SECTION_IDS, sectionLink } from '../landing.config';
```
and replace the Product column's links:
```tsx
            <Link to="/select">Get started</Link>
            <Link to={sectionLink('solutions')}>Solutions</Link>
            <Link to={sectionLink(SECTION_IDS.scrum)}>Scrum board</Link>
            <Link to={sectionLink(SECTION_IDS.messaging)}>Messaging</Link>
            <Link to={sectionLink(SECTION_IDS.assistant)}>Project assistant</Link>
```
(`Solutions` was a bare `#solutions` anchor, which did nothing on `/contact`.)

- [ ] **Step 8: Run the page test and the whole landing folder**

Run: `npx vitest run src/features/landing`
Expected: PASS, 18 tests (4 hook, 6 shell, 2 hero, 6 page).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/landing
git commit -m "feat(landing): compose the feature bands and link them from the header and footer"
```

---

### Task 9: Share metadata

**Files:**
- Modify: `frontend/index.html` (after `<title>`)

- [ ] **Step 1: Add description, Open Graph and Twitter tags**

After `<title>GrepThink 2.0</title>` insert:
```html
    <meta
      name="description"
      content="grepthink helps instructors and student teams form balanced teams, run sprints on a shared scrum board, talk to course staff in team channels, and track weekly progress."
    />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="grepthink" />
    <meta property="og:url" content="https://www.grepthink2.com/" />
    <meta property="og:title" content="grepthink: build better project teams" />
    <meta
      property="og:description"
      content="Scrum boards, team channels and weekly status reports for class projects."
    />
    <meta name="twitter:card" content="summary" />
```
(`og:image` and `twitter:card="summary_large_image"` follow when the Claude Design share image lands.)

- [ ] **Step 2: Build and commit**

Run: `npm run build 2>&1 | tail -3` (expect success), then:
```bash
git add frontend/index.html
git commit -m "feat(landing): description and share metadata"
```

---

### Task 10: Gates

- [ ] **Step 1: Run every frontend gate**

Run (in `frontend/`):
```bash
npm run build && npm run lint && npm run lint:design && npx vitest run
```
Expected: build succeeds; lint prints nothing; `design-adherence: OK`; `Tests  195 passed` (177 + 18).

- [ ] **Step 2: Compare the entry bundle with Task 0**

Run: `npm run build 2>&1 | grep -E "assets/index-" | head -2`
Expected: a few KB more JS and CSS than the baseline; record both numbers in the PR description.

---

### Task 11: See it in the browser

**Files:**
- Create (not committed): `.claude/launch.json` in the worktree; copy the main checkout's `.env` to the worktree root (Vite's `envDir` is `..`).

- [ ] **Step 1: Start the dev server**

`.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "landing-frontend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["--prefix", "frontend", "run", "dev", "--", "--port", "5178", "--strictPort"],
      "port": 5178
    }
  ]
}
```
Start it with the preview tool (`preview_start` name `landing-frontend`).

- [ ] **Step 2: Check each band at 1440px, 900px and 390px, plus reduced motion**

For each width: load `/`, scroll to each band, confirm the reveal, the moment and the layout
(three cards / two / one), and take a screenshot. Then emulate reduced motion and confirm the
final frames show without animation. Click "Features", the hero pill and each footer anchor
(from `/` and from `/contact`) and confirm the band's heading lands below the header.
Check the console for errors.

- [ ] **Step 3: Fix what the browser shows, re-run Task 10, commit**

---

### Task 12: Spec touch-ups and the PR

- [ ] **Step 1: Bring the spec in line with what was built**

In `docs/superpowers/specs/2026-09-24-landing-new-features-design.md`:
- Motion: "seen" is when a band enters the upper 80% of the viewport (a root margin, so tall bands
  still trigger); each moment starts 0.9–1.2s after that, once the cards have settled.
- Band 3's moment: Approve is pressed, becomes "Approved", Dismiss fades and the task chip reads
  "Moved to Done"; the suggestion text stays, so the still frame keeps its context.
- Responsive: the scrum band's phone card (the task card) has no moment of its own.

- [ ] **Step 2: Commit, push, open the PR as a draft**

```bash
git add docs/superpowers/specs/2026-09-24-landing-new-features-design.md
git commit -m "docs(spec): match the landing spec to the build"
git push -u origin feat/landing-new-features
gh pr create --draft --base beta --title "Landing: scrum board, messaging and project assistant bands" --body-file <body>
```
The body says it must merge only after #177 and the scrum PROD migrations, lists the gates and
bundle sizes, and links the Claude Design handoff.

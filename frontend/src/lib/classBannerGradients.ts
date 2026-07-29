/**
 * Preset gradient palettes for class banners.
 * The first preset matches GradientBackgroundWrapper (auth signup background).
 *
 * All hex literals below predate the --gt-* design-token system and are a
 * decorative, self-contained palette (background + 3-particle gradients need
 * far more distinct hues than the small semantic token set provides) — left
 * as-is rather than churned as a side effect of wiring the adherence lint.
 */
export interface ClassBannerGradientPreset {
  id: string;
  background: string;
  particles: [string, string, string];
}

export const CLASS_BANNER_GRADIENT_PRESETS: ClassBannerGradientPreset[] = [
  {
    id: 'teal-violet',
    background: '#0E0E0E',
    particles: ['#0C6168', '#0E0E0E', '#560C68'],
  },
  {
    id: 'ocean-blue',
    background: '#0B1220',
    particles: ['#2771FF', '#0C6168', '#1A2A4A'],
  },
  {
    id: 'forest-teal',
    background: '#0A1410',
    particles: ['#018156', '#0C6168', '#0E0E0E'],
  },
  {
    id: 'sunset-plum',
    background: '#140A10',
    particles: ['#FF6B35', '#560C68', '#0E0E0E'],
  },
  {
    id: 'royal-night',
    background: '#0E0E14',
    particles: ['#2771FF', '#560C68', '#0C6168'],
  },
];

/** Deterministic preset pick so the same class always gets the same banner. */
export function pickClassBannerPreset(seed: string): ClassBannerGradientPreset {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const index = hash % CLASS_BANNER_GRADIENT_PRESETS.length;
  return CLASS_BANNER_GRADIENT_PRESETS[index];
}

/** CSS background for cards when image_url is missing (fallback). */
export function presetToCssBackground(preset: ClassBannerGradientPreset): string {
  const [c1, , c3] = preset.particles;
  return `radial-gradient(circle at 15% 35%, ${c1} 0%, transparent 55%), radial-gradient(circle at 85% 65%, ${c3} 0%, transparent 50%), ${preset.background}`;
}

/** Preset used on auth pages (GradientBackgroundWrapper). */
export const AUTH_GRADIENT_PRESET = CLASS_BANNER_GRADIENT_PRESETS[0];

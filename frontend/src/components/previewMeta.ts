/**
 * What a kit component's preview (`<Folder>/<Folder>.preview.tsx`) tells the design-system build,
 * as `export const meta: PreviewMeta = { … }`. The build reads it from the source text, so it is an
 * object literal of string and number literals only. The app never imports a preview.
 */
export type PreviewMeta = {
  /** The card's group in the Design System: the design manifest's groups. */
  group: 'Primitives' | 'Display' | 'Feedback' | 'Navigation';
  /** The card's frame height in px, 40–4000: enough for every example, an open overlay included. */
  height: number;
  /** A line under the card's name. */
  subtitle?: string;
  /** The bundle export the card belongs to, when it is not the folder's name (`MarkdownText`). */
  component?: string;
  /**
   * A CSS selector the rendered preview must match anywhere in the document (`[role="dialog"]` for
   * an overlay). Without it, the preview's root must hold an element.
   */
  expects?: string;
};

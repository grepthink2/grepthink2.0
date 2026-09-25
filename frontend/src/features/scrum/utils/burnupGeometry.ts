/** Geometry for BurnupChart's 100x100 SVG viewBox. Kept out of the component file so
 *  that file exports only components (fast refresh needs that). */
export const W = 100;
export const H = 100;

/** Points string for a polyline/polygon in the 100x100 viewBox. */
export function seriesPoints(values: number[], steps: number, maxY: number): string {
  return values
    .map((v, i) => `${steps > 1 ? (i / (steps - 1)) * W : 0},${H - (v / maxY) * H}`)
    .join(' ');
}

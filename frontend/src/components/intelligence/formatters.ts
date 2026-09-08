/**
 * Presentation helpers for the analysis panels.
 *
 * Kept out of AnalysisPanels.tsx because a module that exports both components
 * and plain functions breaks React Fast Refresh - which surfaces during
 * development as a spurious "must be used within a Provider" error after an
 * edit, rather than as anything obviously related to the export.
 */

/** Compass bearing in degrees to an 8-point label. */
export function bearingToCompass(deg: number | null): string {
  if (deg === null) return '—';
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round((deg % 360) / 45) % 8];
}

/** Formats a signed number, e.g. "+7.45 °C". */
export function signed(value: number | null, digits = 1, suffix = ''): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}${suffix}`;
}

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

// --- Detection validity vocabulary ---------------------------------------
// Shared so the registry badge and the per-fire page can never drift apart,
// and kept as plain data (no JSX) so this stays a Fast-Refresh-safe module.

import type { ValidityDetail } from '../../types';

export const VERDICT_LABEL: Record<ValidityDetail['verdict'], string> = {
  REAL_FIRE: 'REAL FIRE',
  UNCERTAIN: 'UNCERTAIN',
  LIKELY_FALSE_ALARM: 'LIKELY FALSE ALARM',
};

export const VERDICT_TONE: Record<ValidityDetail['verdict'], string> = {
  REAL_FIRE: 'bg-[#2FA87C]/15 text-[#3DD69C] border-[#2FA87C]/50',
  UNCERTAIN: 'bg-[#E8A93A]/15 text-[#E8A93A] border-[#E8A93A]/50',
  LIKELY_FALSE_ALARM: 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/50',
};

export const VERDICT_BLURB: Record<ValidityDetail['verdict'], string> = {
  REAL_FIRE: 'Thermal signature is consistent with genuine combustion.',
  UNCERTAIN: 'Evidence is mixed. Treat the source classification below with caution.',
  LIKELY_FALSE_ALARM:
    'More consistent with a sensor artefact or a permanent heat source than with a fire. ' +
    'The source classification below is shown for reference only.',
};

/** Plain-English rendering of a validity concern token. */
export const CONCERN_TEXT: Record<string, string> = {
  low_nasa_confidence: 'NASA assigned this detection low confidence',
  weak_thermal_contrast: 'Thermal contrast is weak for this time of day',
  very_low_frp: 'Radiative power is near the sensor detection floor',
  off_nadir: 'Pixel sits far off-nadir, degrading reliability',
  persistent_hotspot: 'Recurs at this exact spot — consistent with permanent infrastructure',
  possible_water_glint: 'Daytime detection near water — sun glint can mimic a fire',
  single_observation: 'Seen once, with no corroborating pass',
};

export function concernText(token: string): string {
  return CONCERN_TEXT[token] ?? token;
}

/**
 * Distance to the nearest registry facility.
 *
 * The registry is a curated asset list, so a fire can legitimately have no
 * neighbouring facility. Rendering the raw 0 that stands in for "none" would
 * read as "inside the perimeter" — the opposite of the truth.
 */
export function facilityDistance(nearestFacilityId: string, km: number): string {
  if (!nearestFacilityId) return 'none within 50 km';
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

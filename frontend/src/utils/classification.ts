import type { EventClassification } from '../types';

/**
 * Normalizes classification strings from various sources (raw backend model,
 * snake_case, uppercase, or legacy labels) into standardized EventClassification types.
 */
export const normalizeClassification = (rawCls?: string): EventClassification => {
  const s = (rawCls || '').toLowerCase().replace(/[\s_-]+/g, '_');
  if (s.includes('persistent')) return 'Persistent Thermal Source';
  if (s.includes('industrial')) return 'Industrial Fire';
  if (s.includes('flare') || s.includes('gas') || s.includes('oil')) return 'Routine Flare';
  if (s.includes('forest')) return 'Forest Fire';
  if (s.includes('agri') || s.includes('crop') || s.includes('burn')) return 'Agricultural Burning';
  if (s.includes('urban')) return 'Urban';
  return 'Unknown Anomaly';
};

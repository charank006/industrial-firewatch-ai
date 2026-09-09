/**
 * One colour per fire class, shared by the operations map and the globe.
 *
 * These lived only inside GISMapLibre's MapLibre `match` expression, so a
 * second surface plotting the same fires would have drifted from it on the
 * first edit.
 */

import type { EventClassification } from '../types';

export const CLASS_COLOR: Record<EventClassification, string> = {
  // Every class needs its own hue: Routine Flare and Forest Fire were both
  // #FF6B22, so two very different findings drew the same dot on the map.
  'Industrial Fire': '#FF3B30',      // red
  'Routine Flare': '#FF6B22',        // orange-red
  'Forest Fire': '#2FBF71',          // green
  'Agricultural Burning': '#FFB020', // amber
  'Gas/Oil': '#A855F7',              // purple
  'Urban': '#EC4899',                // pink
  'Mining / Extraction': '#8B6F47',  // earth brown
  'Unknown Anomaly': '#66768A',      // grey
};

export const UNCLASSIFIED_COLOR = CLASS_COLOR['Unknown Anomaly'];

export function classColor(classification: string): string {
  return CLASS_COLOR[classification as EventClassification] ?? UNCLASSIFIED_COLOR;
}

/**
 * The same palette as a MapLibre `match` expression.
 * Emitted from the record so the two surfaces cannot disagree.
 */
export function classColorMatchExpression(): (string | string[])[] {
  const pairs = Object.entries(CLASS_COLOR).flatMap(([label, colour]) =>
    label === 'Unknown Anomaly' ? [] : [label, colour],
  );
  return ['match', ['get', 'classification'], ...pairs, UNCLASSIFIED_COLOR] as (string | string[])[];
}

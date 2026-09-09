/**
 * One colour per fire class, shared by the operations map and the globe.
 *
 * These lived only inside GISMapLibre's MapLibre `match` expression, so a
 * second surface plotting the same fires would have drifted from it on the
 * first edit.
 */

import type { EventClassification } from '../types';

export const CLASS_COLOR: Record<EventClassification, string> = {
  'Persistent Thermal Source': '#A855F7',
  'Industrial Fire': '#FF3B30',
  'Routine Flare': '#FF6B22',
  'Forest Fire': '#10B981',
  'Agricultural Burning': '#FFB020',
  'Gas/Oil': '#F97316',
  'Urban': '#38BDF8',
  'Unknown Anomaly': '#66768A',
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

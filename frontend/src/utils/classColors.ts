export const CLASS_COLOR: Record<string, string> = {
  'Persistent Thermal Source': '#A855F7',
  'Industrial Fire': '#EF4444',
  'Routine Flare': '#F97316',
  'Gas/Oil Flare': '#F97316',
  'Forest Fire': '#10B981',
  'Agricultural Burning': '#F59E0B',
  'Gas/Oil': '#8B5CF6',
  'Urban': '#06B6D4',
  'Urban/Other': '#06B6D4',
  'Mining / Extraction': '#D97706',
  'Unknown Anomaly': '#64748B',
  industrial_fire: '#EF4444',
  gas_oil_flare: '#F97316',
  forest_fire: '#10B981',
  agricultural_burning: '#F59E0B',
  urban_other: '#06B6D4',
  mining: '#D97706',
};

export const UNCLASSIFIED_COLOR = '#64748B';

export function classColor(classification: string): string {
  return CLASS_COLOR[classification] ?? UNCLASSIFIED_COLOR;
}

export function classColorMatchExpression(): (string | string[])[] {
  const pairs = Object.entries(CLASS_COLOR).flatMap(([label, colour]) =>
    label === 'Unknown Anomaly' ? [] : [label, colour],
  );
  return ['match', ['get', 'classification'], ...pairs, UNCLASSIFIED_COLOR] as (string | string[])[];
}

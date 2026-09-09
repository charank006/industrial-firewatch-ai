
export const CLASS_COLOR: Record<string, string> = {
  'Persistent Thermal Source': '#A855F7',
  'Industrial Fire': '#FF3B30',
  'Routine Flare': '#FF6B22',
  'Gas/Oil Flare': '#FF6B22',
  'Forest Fire': '#2FBF71',
  'Agricultural Burning': '#FFB020',
  'Gas/Oil': '#A855F7',
  'Urban': '#EC4899',
  'Urban/Other': '#EC4899',
  'Mining / Extraction': '#8B6F47',
  'Unknown Anomaly': '#66768A',
  industrial_fire: '#FF3B30',
  gas_oil_flare: '#FF6B22',
  forest_fire: '#2FBF71',
  agricultural_burning: '#FFB020',
  urban_other: '#EC4899',
  mining: '#8B6F47',
};

export const UNCLASSIFIED_COLOR = '#66768A';

export function classColor(classification: string): string {
  return CLASS_COLOR[classification] ?? UNCLASSIFIED_COLOR;
}

export function classColorMatchExpression(): (string | string[])[] {
  const pairs = Object.entries(CLASS_COLOR).flatMap(([label, colour]) =>
    label === 'Unknown Anomaly' ? [] : [label, colour],
  );
  return ['match', ['get', 'classification'], ...pairs, UNCLASSIFIED_COLOR] as (string | string[])[];
}

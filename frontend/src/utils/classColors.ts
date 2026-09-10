export const CLASS_COLOR: Record<string, string> = {
  // Red Tier: High Thermal Anomalies (Industrial, Flares, Mining)
  'Industrial Fire': '#EF4444',
  'Routine Flare': '#EF4444',
  'Gas/Oil Flare': '#EF4444',
  'Gas/Oil': '#EF4444',
  'Mining / Extraction': '#EF4444',

  // Green Tier: Vegetation & Biomass Combustion
  'Forest Fire': '#10B981',
  'Agricultural Burning': '#10B981',

  // Cyan Tier: Urban, Infrastructure, Baseline Thermal & Unclassified
  'Urban': '#06B6D4',
  'Urban/Other': '#06B6D4',
  'Persistent Thermal Source': '#06B6D4',
  'Unknown Anomaly': '#06B6D4',

  // Backwards compatibility mappings for backend snake_case keys
  industrial_fire: '#EF4444',
  gas_oil_flare: '#EF4444',
  flare: '#EF4444',
  industrial: '#EF4444',
  mining: '#EF4444',
  forest_fire: '#10B981',
  forest: '#10B981',
  agricultural_burning: '#10B981',
  agriculture: '#10B981',
  urban_other: '#06B6D4',
  urban: '#06B6D4',
  unknown: '#06B6D4',
};

export const UNCLASSIFIED_COLOR = '#06B6D4';

export function classColor(classification: string): string {
  return CLASS_COLOR[classification] ?? UNCLASSIFIED_COLOR;
}

export function classColorMatchExpression(): (string | string[])[] {
  const pairs = Object.entries(CLASS_COLOR).flatMap(([label, colour]) =>
    label === 'Unknown Anomaly' ? [] : [label, colour],
  );
  return ['match', ['get', 'classification'], ...pairs, UNCLASSIFIED_COLOR] as (string | string[])[];
}

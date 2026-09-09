/**
 * GeoFlare AI - Centralized GIS Map Symbology & Style Configuration.
 * 
 * Defines distinct colors, shapes, stroke weights, and glow styling
 * to clearly differentiate Persistent Thermal Sources from ML-classified events.
 */

export interface SymbologyStyle {
  label: string;
  color: string;
  borderColor: string;
  borderWidth: number;
  shape: 'diamond' | 'circle' | 'square';
  dashArray?: number[];
  opacity: number;
  glowColor?: string;
  badgeBg: string;
  badgeText: string;
}

export const MAP_SYMBOLOGY_CONFIG: Record<string, SymbologyStyle> = {
  'Persistent Thermal Source': {
    label: 'Persistent Thermal Source',
    color: '#00E5FF',          // Vivid Cyan / Electric Blue
    borderColor: '#FFFFFF',
    borderWidth: 3,
    shape: 'diamond',
    opacity: 0.95,
    glowColor: 'rgba(0, 229, 255, 0.4)',
    badgeBg: 'bg-[#00E5FF]/20',
    badgeText: 'text-[#00E5FF]',
  },
  'Industrial Fire': {
    label: 'Industrial Fire',
    color: '#FF3B30',          // High-vis Crimson Red
    borderColor: '#FFFFFF',
    borderWidth: 2,
    shape: 'circle',
    opacity: 0.95,
    glowColor: 'rgba(255, 59, 48, 0.5)',
    badgeBg: 'bg-[#FF3B30]/20',
    badgeText: 'text-[#FF3B30]',
  },
  'industrial_fire': {
    label: 'Industrial Fire',
    color: '#FF3B30',
    borderColor: '#FFFFFF',
    borderWidth: 2,
    shape: 'circle',
    opacity: 0.95,
    glowColor: 'rgba(255, 59, 48, 0.5)',
    badgeBg: 'bg-[#FF3B30]/20',
    badgeText: 'text-[#FF3B30]',
  },
  'Routine Flare': {
    label: 'Gas / Oil Flare',
    color: '#FF6B22',          // Flare Orange
    borderColor: '#FFFFFF',
    borderWidth: 2,
    shape: 'circle',
    opacity: 0.9,
    glowColor: 'rgba(255, 107, 34, 0.4)',
    badgeBg: 'bg-[#FF6B22]/20',
    badgeText: 'text-[#FF6B22]',
  },
  'gas_oil_flare': {
    label: 'Gas / Oil Flare',
    color: '#FF6B22',
    borderColor: '#FFFFFF',
    borderWidth: 2,
    shape: 'circle',
    opacity: 0.9,
    glowColor: 'rgba(255, 107, 34, 0.4)',
    badgeBg: 'bg-[#FF6B22]/20',
    badgeText: 'text-[#FF6B22]',
  },
  'Forest Fire': {
    label: 'Forest Fire',
    color: '#FF9500',          // Amber
    borderColor: '#FFFFFF',
    borderWidth: 2,
    shape: 'circle',
    opacity: 0.9,
    badgeBg: 'bg-[#FF9500]/20',
    badgeText: 'text-[#FF9500]',
  },
  'forest_fire': {
    label: 'Forest Fire',
    color: '#FF9500',
    borderColor: '#FFFFFF',
    borderWidth: 2,
    shape: 'circle',
    opacity: 0.9,
    badgeBg: 'bg-[#FF9500]/20',
    badgeText: 'text-[#FF9500]',
  },
  'Agricultural Burning': {
    label: 'Agricultural Burning',
    color: '#FFCC00',          // Warm Yellow
    borderColor: '#050A12',
    borderWidth: 1.5,
    shape: 'circle',
    opacity: 0.85,
    badgeBg: 'bg-[#FFCC00]/20',
    badgeText: 'text-[#FFCC00]',
  },
  'agricultural_burning': {
    label: 'Agricultural Burning',
    color: '#FFCC00',
    borderColor: '#050A12',
    borderWidth: 1.5,
    shape: 'circle',
    opacity: 0.85,
    badgeBg: 'bg-[#FFCC00]/20',
    badgeText: 'text-[#FFCC00]',
  },
  'Urban / Other': {
    label: 'Urban / Other',
    color: '#AF52DE',          // Electric Purple
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    shape: 'circle',
    opacity: 0.85,
    badgeBg: 'bg-[#AF52DE]/20',
    badgeText: 'text-[#AF52DE]',
  },
  'urban_other': {
    label: 'Urban / Other',
    color: '#AF52DE',
    borderColor: '#FFFFFF',
    borderWidth: 1.5,
    shape: 'circle',
    opacity: 0.85,
    badgeBg: 'bg-[#AF52DE]/20',
    badgeText: 'text-[#AF52DE]',
  },
  'Unknown Anomaly': {
    label: 'Unknown Anomaly',
    color: '#8E8E93',          // Neutral Steel Grey
    borderColor: '#48484A',
    borderWidth: 1.5,
    shape: 'circle',
    opacity: 0.7,
    badgeBg: 'bg-[#8E8E93]/20',
    badgeText: 'text-[#8E8E93]',
  },
  'unknown': {
    label: 'Unknown Anomaly',
    color: '#8E8E93',
    borderColor: '#48484A',
    borderWidth: 1.5,
    shape: 'circle',
    opacity: 0.7,
    badgeBg: 'bg-[#8E8E93]/20',
    badgeText: 'text-[#8E8E93]',
  }
};

export const getSymbology = (classification: string): SymbologyStyle => {
  return MAP_SYMBOLOGY_CONFIG[classification] || MAP_SYMBOLOGY_CONFIG['unknown'];
};

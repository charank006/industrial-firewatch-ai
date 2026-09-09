import type { IndustrialFacility, ThermalHotspot } from '../types';

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Point' | 'Polygon' | 'LineString';
      coordinates: any;
    };
    properties: Record<string, any>;
  }>;
}

export function hotspotsToGeoJSON(hotspots: ThermalHotspot[]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: hotspots.map((h) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [h.lng, h.lat],
      },
      properties: {
        id: h.id,
        frpMw: h.frpMw,
        brightnessK: h.brightnessK,
        confidence: h.confidence,
        classification: h.classification,
        severity: h.severity,
        locationName: h.locationName,
        nearestFacilityName: h.nearestFacilityName,
        facilityDistanceKm: h.facilityDistanceKm,
        timeFormatted: h.timeFormatted,
      },
    })),
  };
}

export function facilitiesToGeoJSON(facilities: IndustrialFacility[]): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: facilities.map((f) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [f.lng, f.lat],
      },
      properties: {
        id: f.id,
        name: f.name,
        type: f.type,
        status: f.status,
        baselineFRP: f.baselineFRP,
        currentFRP: f.currentFRP,
        location: f.location,
      },
    })),
  };
}

// Generate circular polygon buffer rings around coordinates (meters)
function createCirclePolygon(centerLat: number, centerLng: number, radiusMeters: number, numPoints = 64) {
  const coords: [number, number][] = [];
  const km = radiusMeters / 1000;
  const distanceKm = km / 111.32; // Approx degrees lat

  for (let i = 0; i < numPoints; i++) {
    const theta = (i / numPoints) * (2 * Math.PI);
    const dLat = distanceKm * Math.cos(theta);
    const dLng = (distanceKm * Math.sin(theta)) / Math.cos((centerLat * Math.PI) / 180);
    coords.push([centerLng + dLng, centerLat + dLat]);
  }
  coords.push(coords[0]); // Close ring
  return [coords];
}

export function riskZonesToGeoJSON(incident: ThermalHotspot | null, customRadiusMeters = 1000): GeoJSONFeatureCollection {
  if (!incident) {
    return { type: 'FeatureCollection', features: [] };
  }

  const radii = [
    { radius: customRadiusMeters * 0.5, level: 'critical', label: '500m High Risk Buffer' },
    { radius: customRadiusMeters, level: 'warning', label: '1km Danger Zone' },
    { radius: customRadiusMeters * 2, level: 'monitoring', label: '2km Monitoring Sector' },
  ];

  return {
    type: 'FeatureCollection',
    features: radii.map((r) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: createCirclePolygon(incident.lat, incident.lng, r.radius),
      },
      properties: { label: r.label, radius: r.radius, level: r.level },
    })),
  };
}

export function industrialZonesToGeoJSON(): GeoJSONFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [72.81, 21.15],
              [72.86, 21.15],
              [72.86, 21.20],
              [72.81, 21.20],
              [72.81, 21.15],
            ],
          ],
        },
        properties: { name: 'Surat Petrochemical Industrial Zone' },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [72.60, 21.09],
              [72.67, 21.09],
              [72.67, 21.14],
              [72.60, 21.14],
              [72.60, 21.09],
            ],
          ],
        },
        properties: { name: 'Hazira Coastal LNG & Power Zone' },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [72.50, 21.68],
              [72.56, 21.68],
              [72.56, 21.73],
              [72.50, 21.73],
              [72.50, 21.68],
            ],
          ],
        },
        properties: { name: 'Dahej SEZ Chemical Estate' },
      },
    ],
  };
}

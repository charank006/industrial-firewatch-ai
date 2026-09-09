import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useIntelligence } from '../../context/IntelligenceContext';
import {
  facilitiesToGeoJSON,
  hotspotsToGeoJSON,
  industrialZonesToGeoJSON,
  riskZonesToGeoJSON,
} from '../../utils/geojson';

export const GISMapLibre: React.FC<{ height?: string }> = ({ height = 'h-full' }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const {
    filteredHotspots,
    facilities,
    selectedIncident,
    selectedFacility,
    setSelectedIncident,
    setSelectedFacility,
    setIsDrawerOpen,
    layers,
    mapMode,
  } = useIntelligence();

  // Initialize MapLibre Map with Satellite Imagery + Clean Vector Dark Basemap
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter: [number, number] = selectedIncident
      ? [selectedIncident.lng, selectedIncident.lat]
      : selectedFacility
      ? [selectedFacility.lng, selectedFacility.lat]
      : [78.9629, 21.5937];

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'clean-dark-basemap': {
            type: 'raster',
            tiles: [
              'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
            ],
            tileSize: 256,
            attribution: '&copy; Esri &copy; OpenStreetMap',
          },
          'esri-satellite': {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: '&copy; Esri World Imagery',
          },
        },
        layers: [
          {
            id: 'basemap-dark',
            type: 'raster',
            source: 'clean-dark-basemap',
            minzoom: 0,
            maxzoom: 19,
            layout: {
              visibility: mapMode === 'dark' ? 'visible' : 'none',
            },
          },
          {
            id: 'basemap-satellite',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19,
            layout: {
              visibility: mapMode === 'satellite' ? 'visible' : 'visible', // Default Satellite Visibility
            },
          },
        ],
      },
      center: initialCenter,
      zoom: selectedIncident ? 11.0 : 5.2,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
    mapRef.current = map;

    map.on('load', () => {
      // Add Sources
      map.addSource('hotspots-source', {
        type: 'geojson',
        data: hotspotsToGeoJSON(filteredHotspots) as any,
      });

      map.addSource('facilities-source', {
        type: 'geojson',
        data: facilitiesToGeoJSON(facilities) as any,
      });

      map.addSource('risk-zones-source', {
        type: 'geojson',
        data: riskZonesToGeoJSON(selectedIncident) as any,
      });

      map.addSource('industrial-zones-source', {
        type: 'geojson',
        data: industrialZonesToGeoJSON() as any,
      });

      map.addSource('selected-hotspot-source', {
        type: 'geojson',
        data: selectedIncident ? (hotspotsToGeoJSON([selectedIncident]) as any) : { type: 'FeatureCollection', features: [] },
      });

      // Add Indian States Political Structure GeoJSON Source
      map.addSource('india-states-source', {
        type: 'geojson',
        data: '/india_states.geojson',
      });

      // Add Indian States Political Structure Fill Layer
      map.addLayer({
        id: 'india-states-fill',
        type: 'fill',
        source: 'india-states-source',
        paint: {
          'fill-color': [
            'match',
            ['get', 'state_name'],
            'Telangana', 'rgba(16, 185, 129, 0.08)',
            'Andhra Pradesh', 'rgba(249, 115, 22, 0.07)',
            'Odisha', 'rgba(56, 189, 248, 0.06)',
            'Orissa', 'rgba(56, 189, 248, 0.06)',
            'Tamil Nadu', 'rgba(168, 85, 247, 0.06)',
            'Chhattisgarh', 'rgba(34, 197, 94, 0.06)',
            'Maharashtra', 'rgba(59, 130, 246, 0.06)',
            'Gujarat', 'rgba(234, 179, 8, 0.06)',
            'Punjab', 'rgba(239, 68, 68, 0.06)',
            'Haryana', 'rgba(244, 63, 94, 0.06)',
            'Madhya Pradesh', 'rgba(20, 184, 166, 0.06)',
            'Karnataka', 'rgba(139, 92, 246, 0.06)',
            'Kerala', 'rgba(16, 185, 129, 0.06)',
            'Jharkhand', 'rgba(236, 72, 153, 0.06)',
            'Rajasthan', 'rgba(245, 158, 11, 0.06)',
            'West Bengal', 'rgba(6, 182, 212, 0.06)',
            'Uttar Pradesh', 'rgba(217, 119, 6, 0.06)',
            'Bihar', 'rgba(132, 204, 22, 0.06)',
            'Assam', 'rgba(14, 165, 233, 0.06)',
            'Ladakh', 'rgba(148, 163, 184, 0.06)',
            'Jammu & Kashmir', 'rgba(99, 102, 241, 0.06)',
            'rgba(255, 255, 255, 0.02)',
          ],
          'fill-opacity': 0.85,
        },
      });

      // Add Indian States Political Boundaries Border Lines Layer
      map.addLayer({
        id: 'india-states-line',
        type: 'line',
        source: 'india-states-source',
        paint: {
          'line-color': 'rgba(56, 189, 248, 0.65)',
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3, 0.8,
            6, 1.4,
            10, 2.0,
          ],
          'line-dasharray': [3, 2],
        },
      });

      // Add Industrial Zone Boundary Layer
      map.addLayer({
        id: 'industrial-zones-line',
        type: 'line',
        source: 'industrial-zones-source',
        paint: {
          'line-color': '#38bdf8',
          'line-width': 1.8,
          'line-dasharray': [4, 4],
        },
      });

      // Add Risk Buffer Polygon Fill & Line Layers
      map.addLayer({
        id: 'risk-zones-fill',
        type: 'fill',
        source: 'risk-zones-source',
        paint: {
          'fill-color': [
            'match',
            ['get', 'level'],
            'critical', '#FF3B30',
            'warning', '#FFB020',
            'monitoring', '#16A9D9',
            '#16A9D9',
          ],
          'fill-opacity': 0.18,
        },
      });

      map.addLayer({
        id: 'risk-zones-line',
        type: 'line',
        source: 'risk-zones-source',
        paint: {
          'line-color': [
            'match',
            ['get', 'level'],
            'critical', '#FF3B30',
            'warning', '#FFB020',
            'monitoring', '#16A9D9',
            '#16A9D9',
          ],
          'line-width': 2,
          'line-dasharray': [3, 3],
        },
      });

      // Add Facilities Layer - Clean micro industrial points
      map.addLayer({
        id: 'facilities-layer',
        type: 'circle',
        source: 'facilities-source',
        paint: {
          'circle-color': '#0EA5E9',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3, 2.0,
            7, 3.2,
            12, 4.8,
          ],
          'circle-stroke-width': 0.8,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.85,
        },
      });

      // Add Thermal Hotspots Layer - Precision, decreased marker size with zoom interpolation
      map.addLayer({
        id: 'hotspots-layer',
        type: 'circle',
        source: 'hotspots-source',
        paint: {
          'circle-color': [
            'match',
            ['get', 'classification'],
            'Persistent Thermal Source', '#A855F7',
            'Industrial Fire', '#FF3B30',
            'Routine Flare', '#FF6B22',
            'Forest Fire', '#10B981',
            'Agricultural Burning', '#FFB020',
            'Gas/Oil', '#F97316',
            'Urban', '#38BDF8',
            '#66768A',
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3, [
              'interpolate', ['linear'], ['get', 'frpMw'],
              2, 1.8,
              50, 2.6,
              200, 3.8,
            ],
            6, [
              'interpolate', ['linear'], ['get', 'frpMw'],
              2, 2.4,
              50, 3.8,
              200, 5.5,
            ],
            10, [
              'interpolate', ['linear'], ['get', 'frpMw'],
              2, 3.6,
              50, 5.5,
              200, 8.0,
            ],
          ],
          'circle-stroke-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3, 0.5,
            7, 0.8,
            12, 1.2,
          ],
          'circle-stroke-color': 'rgba(255, 255, 255, 0.8)',
          'circle-opacity': 0.9,
        },
      });

      // Add Selected Hotspot Target Reticle Layer
      map.addLayer({
        id: 'selected-hotspot-ring',
        type: 'circle',
        source: 'selected-hotspot-source',
        paint: {
          'circle-color': 'transparent',
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            3, 6,
            7, 10,
            12, 15,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#38BDF8',
          'circle-stroke-opacity': 0.95,
        },
      });

      // Interactive Map Popup on Hotspot Click
      map.on('click', 'hotspots-layer', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const properties = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates.slice();

        if (properties && properties.id) {
          const found = filteredHotspots.find((h) => h.id === properties.id);
          if (found) {
            setSelectedIncident(found);
            setIsDrawerOpen(true);

            new maplibregl.Popup({ className: 'custom-map-popup', maxWidth: '300px' })
              .setLngLat(coords)
              .setHTML(`
                <div style="background: #080C14; color: #fff; border: 1px solid rgba(56,189,248,0.4); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; line-height: 1.4; box-shadow: 0 4px 20px rgba(0,0,0,0.6);">
                  <div style="color: #38bdf8; font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; display: flex; justify-content: space-between;">
                    <span>${found.id}</span>
                    <span style="color: ${found.isPersistent ? '#c084fc' : '#34d399'}; font-size: 10px;">${found.classification}</span>
                  </div>
                  <div><strong style="color: #94a3b8;">COORDINATES:</strong> ${found.lat.toFixed(4)}°N, ${found.lng.toFixed(4)}°E</div>
                  <div><strong style="color: #94a3b8;">TIME:</strong> ${found.timeFormatted} (${found.dayNight === 'D' ? 'Day' : 'Night'})</div>
                  <div><strong style="color: #94a3b8;">RADIATIVE POWER:</strong> <span style="color: #f59e0b; font-weight: bold;">${found.frpMw} MW</span></div>
                  <div><strong style="color: #94a3b8;">BRIGHTNESS TEMP:</strong> <span style="color: #fbbf24;">${found.brightnessK} K</span></div>
                  <div><strong style="color: #94a3b8;">ML CONFIDENCE:</strong> <span style="color: #10b981; font-weight: bold;">${found.confidence}%</span></div>
                  <div style="border-top: 1px solid rgba(255,255,255,0.1); margin-top: 5px; padding-top: 4px; color: #cbd5e1; font-size: 10px;">
                    🏭 ${found.nearestFacilityName} (${Math.round(found.facilityDistanceKm * 1000)}m)
                  </div>
                </div>
              `)
              .addTo(map);
          }
        }
      });

      // Interactive Facility Click Event
      map.on('click', 'facilities-layer', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const properties = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates.slice();

        if (properties && properties.id) {
          const found = facilities.find((f) => f.id === properties.id);
          if (found) {
            setSelectedFacility(found);

            new maplibregl.Popup({ className: 'custom-map-popup' })
              .setLngLat(coords)
              .setHTML(`
                <div style="background: #080C14; color: #fff; border: 1px solid rgba(56,189,248,0.4); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px;">
                  <div style="color: #38bdf8; font-weight: bold; margin-bottom: 4px;">🏭 ${found.name}</div>
                  <div><strong>TYPE:</strong> ${found.type}</div>
                  <div><strong>BASELINE:</strong> ${found.baselineFRP} MW</div>
                  <div><strong>STATUS:</strong> <span style="color: ${found.status === 'ANOMALY_DETECTED' ? '#ef4444' : '#10b981'}; font-weight: bold;">${found.status}</span></div>
                </div>
              `)
              .addTo(map);
          }
        }
      });

      // Cursor Pointers
      map.on('mouseenter', 'hotspots-layer', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'hotspots-layer', () => (map.getCanvas().style.cursor = ''));
      map.on('mouseenter', 'facilities-layer', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'facilities-layer', () => (map.getCanvas().style.cursor = ''));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Synchronize Basemap Mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('basemap-satellite')) {
      map.setLayoutProperty('basemap-satellite', 'visibility', mapMode === 'satellite' ? 'visible' : 'none');
    }
    if (map.getLayer('basemap-dark')) {
      map.setLayoutProperty('basemap-dark', 'visibility', mapMode === 'dark' ? 'visible' : 'none');
    }
  }, [mapMode]);

  // Synchronize Data Sources when state updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const hsSource = map.getSource('hotspots-source') as maplibregl.GeoJSONSource;
    if (hsSource) {
      hsSource.setData(hotspotsToGeoJSON(filteredHotspots) as any);
    }

    const facSource = map.getSource('facilities-source') as maplibregl.GeoJSONSource;
    if (facSource) {
      facSource.setData(facilitiesToGeoJSON(facilities) as any);
    }

    const rkSource = map.getSource('risk-zones-source') as maplibregl.GeoJSONSource;
    if (rkSource) {
      rkSource.setData(riskZonesToGeoJSON(selectedIncident) as any);
    }

    const selSource = map.getSource('selected-hotspot-source') as maplibregl.GeoJSONSource;
    if (selSource) {
      selSource.setData(selectedIncident ? (hotspotsToGeoJSON([selectedIncident]) as any) : { type: 'FeatureCollection', features: [] });
    }
  }, [filteredHotspots, facilities, selectedIncident]);

  // Synchronize Layer Visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('hotspots-layer')) {
      map.setLayoutProperty('hotspots-layer', 'visibility', layers.thermalVIIRS ? 'visible' : 'none');
    }
    if (map.getLayer('facilities-layer')) {
      map.setLayoutProperty('facilities-layer', 'visibility', layers.industrialFacilities ? 'visible' : 'none');
    }
    if (map.getLayer('risk-zones-fill')) {
      map.setLayoutProperty('risk-zones-fill', 'visibility', layers.riskZones ? 'visible' : 'none');
      map.setLayoutProperty('risk-zones-line', 'visibility', layers.riskZones ? 'visible' : 'none');
    }
    if (map.getLayer('india-states-fill')) {
      map.setLayoutProperty('india-states-fill', 'visibility', layers.administrativeBounds ? 'visible' : 'none');
    }
    if (map.getLayer('india-states-line')) {
      map.setLayoutProperty('india-states-line', 'visibility', layers.administrativeBounds ? 'visible' : 'none');
    }
  }, [layers]);

  // Fly to selected incident or facility with smooth camera zoom
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedIncident) {
      map.flyTo({
        center: [selectedIncident.lng, selectedIncident.lat],
        zoom: 13.5,
        speed: 1.2,
        curve: 1.4,
        duration: 1400,
      });
    } else if (selectedFacility) {
      map.flyTo({
        center: [selectedFacility.lng, selectedFacility.lat],
        zoom: 12.5,
        speed: 1.2,
        duration: 1400,
      });
    }
  }, [selectedIncident, selectedFacility]);

  return (
    <div className={`relative w-full ${height} overflow-hidden rounded-lg shadow-2xl`}>
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};

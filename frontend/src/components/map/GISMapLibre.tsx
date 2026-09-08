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
      : [72.8311, 21.1702];

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
      zoom: selectedIncident ? 12.5 : 10.5,
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

      // Add Facilities Layer
      map.addLayer({
        id: 'facilities-layer',
        type: 'circle',
        source: 'facilities-source',
        paint: {
          'circle-color': '#38bdf8',
          'circle-radius': 8,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Add Thermal Hotspots Layer
      map.addLayer({
        id: 'hotspots-layer',
        type: 'circle',
        source: 'hotspots-source',
        paint: {
          'circle-color': [
            'match',
            ['get', 'classification'],
            'Industrial Fire', '#FF3B30',
            'Routine Flare', '#FF6B22',
            'Forest Fire', '#FF6B22',
            'Agricultural Burning', '#FFB020',
            '#66768A',
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'frpMw'],
            10, 7,
            100, 12,
            200, 16,
          ],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.95,
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

            new maplibregl.Popup({ className: 'custom-map-popup' })
              .setLngLat(coords)
              .setHTML(`
                <div style="background: #080C14; color: #fff; border: 1px solid rgba(56,189,248,0.4); padding: 10px; border-radius: 6px; font-family: monospace; font-size: 11px;">
                  <div style="color: #38bdf8; font-weight: bold; margin-bottom: 4px;">● ${found.id} &bull; ${found.classification.toUpperCase()}</div>
                  <div><strong>LOCATION:</strong> ${found.locationName}</div>
                  <div><strong>RADIATIVE POWER:</strong> <span style="color: #f59e0b;">${found.frpMw} MW</span></div>
                  <div><strong>BRIGHTNESS TEMP:</strong> ${found.brightnessK} K</div>
                  <div><strong>FACILITY DISTANCE:</strong> ${Math.round(found.facilityDistanceKm * 1000)}m</div>
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
      map.setLayoutProperty('risk-zones-line', 'visibility', layers.riskZones ? 'visibility' : 'none');
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

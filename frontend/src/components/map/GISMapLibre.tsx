import React, { useEffect, useRef, useState } from 'react';
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

  // The init effect below runs once (it must - it builds the map), so any
  // state its handlers close over is frozen at first render. With mock data
  // that was invisible because the arrays were already populated; with async
  // data the first render is empty and every click would look up an id in an
  // empty array. Handlers read through this ref instead, which each render
  // keeps current.
  const liveDataRef = useRef({ filteredHotspots, facilities });
  liveDataRef.current = { filteredHotspots, facilities };

  // MapLibre only accepts addSource/setData once the style has loaded. Every
  // sync effect below used to `return` early on !isStyleLoaded() and never
  // retry, so a payload arriving before `load` fired was dropped for good -
  // leaving the map permanently blank rather than merely stale.
  const [styleReady, setStyleReady] = useState(false);

  // Initialize MapLibre Map
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
          'carto-dark': {
            type: 'raster',
            tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; CARTO &copy; OpenStreetMap',
          },
          'esri-satellite': {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256,
            attribution: '&copy; Esri',
          },
        },
        layers: [
          {
            id: 'basemap-dark',
            type: 'raster',
            source: 'carto-dark',
            minzoom: 0,
            maxzoom: 19,
          },
          {
            id: 'basemap-satellite',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19,
            layout: {
              visibility: mapMode === 'satellite' ? 'visible' : 'none',
            },
          },
        ],
      },
      center: initialCenter,
      zoom: selectedIncident ? 12 : 10,
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
          'line-color': '#287FB1',
          'line-width': 1.5,
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
          'fill-opacity': 0.12,
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
          'line-width': 1.5,
          'line-dasharray': [3, 3],
        },
      });

      // Add Facilities Layer
      map.addLayer({
        id: 'facilities-layer',
        type: 'circle',
        source: 'facilities-source',
        paint: {
          'circle-color': '#16A9D9',
          'circle-radius': 7,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#050A12',
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
            'Gas/Oil', '#A855F7',
            'Urban', '#EC4899',
            '#66768A',
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'frpMw'],
            10, 6,
            100, 10,
            200, 14,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#FFFFFF',
          'circle-opacity': 0.9,
        },
      });

      // Hotspot Click Event
      map.on('click', 'hotspots-layer', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const properties = e.features[0].properties;
        if (properties && properties.id) {
          const found = liveDataRef.current.filteredHotspots.find((h) => h.id === properties.id);
          if (found) {
            setSelectedIncident(found);
            setIsDrawerOpen(true);
          }
        }
      });

      // Facility Click Event
      map.on('click', 'facilities-layer', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const properties = e.features[0].properties;
        if (properties && properties.id) {
          const found = liveDataRef.current.facilities.find((f) => f.id === properties.id);
          if (found) {
            setSelectedFacility(found);
          }
        }
      });

      // Cursor Pointers
      map.on('mouseenter', 'hotspots-layer', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'hotspots-layer', () => (map.getCanvas().style.cursor = ''));
      map.on('mouseenter', 'facilities-layer', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'facilities-layer', () => (map.getCanvas().style.cursor = ''));

      // Sources and layers now exist, so the sync effects can run. They are
      // keyed on this, which is what makes data that arrived before `load`
      // get applied rather than dropped.
      setStyleReady(true);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      setStyleReady(false);
    };
  }, []);

  // Synchronize Basemap Mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

    if (map.getLayer('basemap-satellite')) {
      map.setLayoutProperty('basemap-satellite', 'visibility', mapMode === 'satellite' ? 'visible' : 'none');
    }
  }, [mapMode, styleReady]);

  // Synchronize Data Sources when state updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

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
  }, [filteredHotspots, facilities, selectedIncident, styleReady]);

  // Synchronize Layer Visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleReady) return;

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
  }, [layers, styleReady]);

  // Fly to selected incident or facility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedIncident) {
      map.flyTo({
        center: [selectedIncident.lng, selectedIncident.lat],
        zoom: 13,
        duration: 1200,
      });
    } else if (selectedFacility) {
      map.flyTo({
        center: [selectedFacility.lng, selectedFacility.lat],
        zoom: 12,
        duration: 1200,
      });
    }
  }, [selectedIncident, selectedFacility]);

  return (
    <div className={`relative w-full ${height} overflow-hidden rounded-lg border border-[#203246] shadow-2xl`}>
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};

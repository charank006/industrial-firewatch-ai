import React, { useEffect, useRef, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useIntelligence } from '../../context/IntelligenceContext';
import {
  facilitiesToGeoJSON,
  hotspotsToGeoJSON,
  industrialZonesToGeoJSON,
  riskZonesToGeoJSON,
} from '../../utils/geojson';
import { MAP_SYMBOLOGY_CONFIG } from '../../config/mapSymbology';

export const GISMapLibre: React.FC<{ height?: string }> = ({ height = 'h-full' }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

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

  // Keep references to current state to avoid stale closure issues
  const filteredHotspotsRef = useRef(filteredHotspots);
  filteredHotspotsRef.current = filteredHotspots;

  const facilitiesRef = useRef(facilities);
  facilitiesRef.current = facilities;

  const selectedIncidentRef = useRef(selectedIncident);
  selectedIncidentRef.current = selectedIncident;

  const layersRef = useRef(layers);
  layersRef.current = layers;

  // Helper to safely update GeoJSON sources
  const syncSources = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const hsSource = map.getSource('hotspots-source') as maplibregl.GeoJSONSource | undefined;
    if (hsSource) {
      hsSource.setData(hotspotsToGeoJSON(filteredHotspotsRef.current) as any);
    }

    const facSource = map.getSource('facilities-source') as maplibregl.GeoJSONSource | undefined;
    if (facSource) {
      facSource.setData(facilitiesToGeoJSON(facilitiesRef.current) as any);
    }

    const rkSource = map.getSource('risk-zones-source') as maplibregl.GeoJSONSource | undefined;
    if (rkSource) {
      rkSource.setData(riskZonesToGeoJSON(selectedIncidentRef.current) as any);
    }
  }, []);

  // Show rich popup for selected incident
  const showIncidentPopup = useCallback((incident: typeof selectedIncident) => {
    const map = mapRef.current;
    if (!map || !incident) return;

    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }

    const riskScore = incident.riskScore ?? Math.round(incident.confidence * 100);
    const riskColor = riskScore >= 75 ? '#ef4444' : riskScore >= 45 ? '#f59e0b' : '#10b981';
    const facilityDistanceText = incident.facilityDistanceKm != null 
      ? `${incident.facilityDistanceKm < 1 ? Math.round(incident.facilityDistanceKm * 1000) + ' m' : incident.facilityDistanceKm.toFixed(2) + ' km'}`
      : 'Unknown';
    const facilityName = incident.nearestFacilityName || 'Regional Buffer';
    const facilityType = incident.nearestFacilityType ? ` (${incident.nearestFacilityType.toUpperCase()})` : '';
    const sensorConf = incident.sensorConfidenceRate ?? Math.round(incident.confidence * 100);
    const mlConf = incident.mlConfidenceRate ?? Math.round(incident.confidence * 100);

    const html = `
      <div style="min-width: 250px; font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4; color: #f1f4f6;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #253340; padding-bottom: 5px; margin-bottom: 6px;">
          <span style="font-weight: 700; color: #3db7d9; text-transform: uppercase; font-size: 11px;">${incident.id}</span>
          <span style="background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 10px; color: ${riskColor}; font-weight: 700; border: 1px solid ${riskColor}33;">
            Risk: ${riskScore}/100
          </span>
        </div>

        <div style="font-size: 13px; font-weight: 700; color: #ffffff; margin-bottom: 6px; letter-spacing: 0.02em;">
          ${(incident.classification || 'UNKNOWN').replace(/_/g, ' ').toUpperCase()}
        </div>

        <div style="background: #080e14; border: 1px solid #1e2c3a; border-radius: 5px; padding: 6px 8px; margin-bottom: 6px;">
          <div style="font-size: 9px; text-transform: uppercase; color: #64748b; font-weight: 600;">Nearest Facility</div>
          <div style="font-weight: 600; color: #e2e8f0; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${facilityName}${facilityType}
          </div>
          <div style="font-size: 11px; color: #38bdf8; font-weight: 500;">
            Proximity: ${facilityDistanceText}
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
          <div style="background: #080e14; border: 1px solid #1e2c3a; border-radius: 4px; padding: 4px 6px;">
            <div style="font-size: 9px; color: #64748b; text-transform: uppercase;">Sensor Conf</div>
            <div style="font-size: 12px; font-weight: 700; color: #10b981;">${sensorConf}%</div>
          </div>
          <div style="background: #080e14; border: 1px solid #1e2c3a; border-radius: 4px; padding: 4px 6px;">
            <div style="font-size: 9px; color: #64748b; text-transform: uppercase;">ML Conf</div>
            <div style="font-size: 12px; font-weight: 700; color: #38bdf8;">${mlConf}%</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748b; border-top: 1px solid #1e2c3a; padding-top: 4px;">
          <span>FRP: <strong style="color: #f1f4f6;">${incident.frpMw.toFixed(1)} MW</strong></span>
          <span>Cluster: <strong style="color: #f1f4f6;">${incident.observationCount ?? 1} obs</strong></span>
        </div>
      </div>
    `;

    popupRef.current = new maplibregl.Popup({
      offset: 14,
      closeButton: true,
      closeOnClick: false,
      maxWidth: '300px',
    })
      .setLngLat([incident.lng, incident.lat])
      .setHTML(html)
      .addTo(map);
  }, []);

  // Initialize MapLibre Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter: [number, number] = selectedIncidentRef.current
      ? [selectedIncidentRef.current.lng, selectedIncidentRef.current.lat]
      : [78.9629, 20.5937]; // All-India Geographic Center

    const initialZoom = selectedIncidentRef.current ? 11 : 5;

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
      zoom: initialZoom,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-left');
    mapRef.current = map;

    map.on('load', () => {
      // Add GeoJSON Sources using latest ref data
      map.addSource('hotspots-source', {
        type: 'geojson',
        data: hotspotsToGeoJSON(filteredHotspotsRef.current) as any,
      });

      map.addSource('facilities-source', {
        type: 'geojson',
        data: facilitiesToGeoJSON(facilitiesRef.current) as any,
      });

      map.addSource('risk-zones-source', {
        type: 'geojson',
        data: riskZonesToGeoJSON(selectedIncidentRef.current) as any,
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
        layout: {
          visibility: layersRef.current.landCover ? 'visible' : 'none',
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
        layout: {
          visibility: layersRef.current.riskZones ? 'visible' : 'none',
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
        layout: {
          visibility: layersRef.current.riskZones ? 'visible' : 'none',
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
        layout: {
          visibility: layersRef.current.industrialFacilities ? 'visible' : 'none',
        },
      });

      // Add Thermal Hotspots Layer with Dynamic Multi-Class Styling
      map.addLayer({
        id: 'hotspots-layer',
        type: 'circle',
        source: 'hotspots-source',
        paint: {
          'circle-color': [
            'match',
            ['get', 'classification'],
            'Persistent Thermal Source', MAP_SYMBOLOGY_CONFIG['Persistent Thermal Source'].color,
            'Industrial Fire', MAP_SYMBOLOGY_CONFIG['Industrial Fire'].color,
            'industrial_fire', MAP_SYMBOLOGY_CONFIG['industrial_fire'].color,
            'Routine Flare', MAP_SYMBOLOGY_CONFIG['Routine Flare'].color,
            'gas_oil_flare', MAP_SYMBOLOGY_CONFIG['gas_oil_flare'].color,
            'Forest Fire', MAP_SYMBOLOGY_CONFIG['Forest Fire'].color,
            'forest_fire', MAP_SYMBOLOGY_CONFIG['forest_fire'].color,
            'Agricultural Burning', MAP_SYMBOLOGY_CONFIG['Agricultural Burning'].color,
            'agricultural_burning', MAP_SYMBOLOGY_CONFIG['agricultural_burning'].color,
            'Urban / Other', MAP_SYMBOLOGY_CONFIG['Urban / Other'].color,
            'urban_other', MAP_SYMBOLOGY_CONFIG['urban_other'].color,
            MAP_SYMBOLOGY_CONFIG['unknown'].color,
          ],
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'frpMw'],
            5, 5,
            50, 9,
            150, 14,
            300, 18,
          ],
          'circle-stroke-width': [
            'match',
            ['get', 'classification'],
            'Persistent Thermal Source', 3.0,
            2.0,
          ],
          'circle-stroke-color': [
            'match',
            ['get', 'classification'],
            'Persistent Thermal Source', '#FFFFFF',
            '#050A12',
          ],
          'circle-opacity': 0.95,
        },
        layout: {
          visibility: layersRef.current.thermalVIIRS ? 'visible' : 'none',
        },
      });

      // Hotspot Click Handler - Uses latest ref data
      map.on('click', 'hotspots-layer', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const properties = e.features[0].properties;
        if (properties && properties.id) {
          const found = filteredHotspotsRef.current.find((h) => h.id === properties.id);
          if (found) {
            setSelectedIncident(found);
            setIsDrawerOpen(true);
          }
        }
      });

      // Facility Click Handler - Uses latest ref data
      map.on('click', 'facilities-layer', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const properties = e.features[0].properties;
        if (properties && properties.id) {
          const found = facilitiesRef.current.find((f) => f.id === properties.id);
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

      // Ensure data is synced after load
      syncSources();

      if (selectedIncidentRef.current) {
        showIncidentPopup(selectedIncidentRef.current);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [setSelectedIncident, setSelectedFacility, setIsDrawerOpen, syncSources, showIncidentPopup]);

  // Synchronize Basemap Mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('basemap-satellite')) {
      map.setLayoutProperty('basemap-satellite', 'visibility', mapMode === 'satellite' ? 'visible' : 'none');
    }
  }, [mapMode]);

  // Synchronize Data Sources when state updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (map.isStyleLoaded()) {
      syncSources();
    } else {
      map.once('load', () => {
        syncSources();
      });
    }
  }, [filteredHotspots, facilities, selectedIncident, syncSources]);

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
    if (map.getLayer('industrial-zones-line')) {
      map.setLayoutProperty('industrial-zones-line', 'visibility', layers.landCover ? 'visible' : 'none');
    }
  }, [layers]);

  // Fly to selected incident or facility and show popup
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selectedIncident) {
      const executeFly = () => {
        map.flyTo({
          center: [selectedIncident.lng, selectedIncident.lat],
          zoom: 13,
          duration: 1000,
        });
        showIncidentPopup(selectedIncident);
      };

      if (map.isStyleLoaded()) {
        executeFly();
      } else {
        map.once('load', executeFly);
      }
    } else if (selectedFacility) {
      const executeFlyFac = () => {
        map.flyTo({
          center: [selectedFacility.lng, selectedFacility.lat],
          zoom: 12,
          duration: 1000,
        });
      };

      if (map.isStyleLoaded()) {
        executeFlyFac();
      } else {
        map.once('load', executeFlyFac);
      }
    }
  }, [selectedIncident, selectedFacility, showIncidentPopup]);

  return (
    <div className={`relative w-full ${height} overflow-hidden rounded-lg border border-[#203246] shadow-2xl`}>
      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
};


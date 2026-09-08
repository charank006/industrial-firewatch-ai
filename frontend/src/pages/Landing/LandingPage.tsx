import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Globe from 'globe.gl';
import * as THREE from 'three';
import { Globe2 } from 'lucide-react';

import { getEarthNightTexture } from '../../utils/earthTexture';
import { HISTORICAL_EVENTS } from '../../data/historicalEvents';
import { LANDING_SIGNALS } from '../../data/landingSignals';
import {
  SatelliteDossierModal,
  SATELLITE_DOSSIERS,
  type SatelliteDossier
} from '../../components/modals/SatelliteDossierModal';

// --- BEAT 3: CONTEXT ENGINE LAYERS ---
type ContextLayer = 'thermal' | 'infrastructure' | 'history';

// --- BEAT 4: THE 5 PRACTICAL SIGNATURES ---
interface SignatureItem {
  id: string;
  name: string;
  category: string;
  verdict: 'ROUTINE OPERATION' | 'CRITICAL THREAT' | 'MONITORED BURN';
  verdictColor: string;
  summary: string;
  howItWorks: string;
  sampleLocation: string;
  temp: string;
  power: string;
  area: string;
  heatColors: string[];
}

const SIGNATURES: SignatureItem[] = [
  {
    id: 'flare',
    name: 'Refinery Flare Stack',
    category: 'Petrochemical Facility',
    verdict: 'ROUTINE OPERATION',
    verdictColor: '#38bdf8', // Cyan
    sampleLocation: 'Deer Park Refinery, Texas, USA',
    temp: '1,120°C',
    power: '420 MW',
    area: '25 m² (Point Source)',
    heatColors: ['#38bdf8', '#0284c7', '#0369a1'],
    summary: 'Controlled safety relief burn inside registered industrial plant perimeter.',
    howItWorks: 'GeoFlare matches the coordinates against global refinery polygons and verifies active heat signatures on >140 of the last 180 days.',
  },
  {
    id: 'wildfire',
    name: 'Uncontained Wildfire',
    category: 'Vegetation & Forest Boundary',
    verdict: 'CRITICAL THREAT',
    verdictColor: '#ef4444', // Red
    sampleLocation: 'Shasta-Trinity National Forest, CA',
    temp: '860°C',
    power: '1,840 MW',
    area: '14.2 km² (Rapid Spread)',
    heatColors: ['#f87171', '#dc2626', '#991b1b'],
    summary: 'Rapidly spreading perimeter crossing wildland-urban interface (WUI).',
    howItWorks: 'Zero historical thermal activity recorded at these coordinates. Spatial clustering indicates non-stationary, directional advance.',
  },
  {
    id: 'facility-fire',
    name: 'Industrial Structure Fire',
    category: 'Storage & Warehouse Asset',
    verdict: 'CRITICAL THREAT',
    verdictColor: '#f97316', // Orange
    sampleLocation: 'Port of Antwerp Chemical Terminal',
    temp: '1,320°C',
    power: '950 MW',
    area: '350 m² (Non-Flare Zone)',
    heatColors: ['#fb923c', '#ea580c', '#9a3412'],
    summary: 'High-intensity uncontrolled thermal event inside an active industrial facility.',
    howItWorks: 'Thermal anomaly detected within industrial zone boundaries, but physically offset from permitted flare stack coordinates.',
  },
  {
    id: 'agriculture',
    name: 'Agricultural Burn',
    category: 'Farmland Crop Management',
    verdict: 'MONITORED BURN',
    verdictColor: '#10b981', // Emerald
    sampleLocation: 'Sacramento Valley Farmland, CA',
    temp: '510°C',
    power: '120 MW',
    area: '1.8 km² (Low Intensity)',
    heatColors: ['#34d399', '#059669', '#065f46'],
    summary: 'Low-temperature crop residue clearing on recognized agricultural parcel.',
    howItWorks: 'Heat intensity remains low-grade (<600°C) and conforms precisely to seasonal parcel boundaries without expanding into surrounding timber.',
  },
  {
    id: 'smelter',
    name: 'Mining & Blast Furnace',
    category: 'Metals & Smelting Infrastructure',
    verdict: 'ROUTINE OPERATION',
    verdictColor: '#a855f7', // Purple
    sampleLocation: 'Pilbara Iron Ore Operation, Australia',
    temp: '1,450°C',
    power: '1,280 MW',
    area: '80 m² (Localized Pit)',
    heatColors: ['#c084fc', '#9333ea', '#6b21a8'],
    summary: 'Continuous extreme localized heat generated during smelting cycles.',
    howItWorks: 'Stationary point-source thermal signature confined to heavy mineral excavation and slag-cooling pits.',
  },
];

export default function GeoFlareLanding() {
  const navigate = useNavigate();

  // Beat 3: Context Interactive Demo State
  const [activeLayers, setActiveLayers] = useState<ContextLayer[]>(['thermal']);
  
  // Beat 4: Active Classification Selection
  const [selectedSig, setSelectedSig] = useState<SignatureItem>(SIGNATURES[0]);

  // Satellite Dossier Modal State
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteDossier | null>(null);

  // Three.js Globe Reference
  const globeElRef = useRef<HTMLDivElement | null>(null);
  const globeInstanceRef = useRef<any>(null);

  // Toggle Context Layer Helper
  const toggleLayer = (layer: ContextLayer) => {
    if (layer === 'thermal') return; // Thermal is the base layer
    setActiveLayers((prev) =>
      prev.includes(layer) ? prev.filter((l) => l !== layer) : [...prev, layer]
    );
  };

  // 3D WebGL Three.js Globe Initialization + Minimal Thermal Heatmap + Infrared Scan Beam
  useEffect(() => {
    if (!globeElRef.current) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nasaSatTexture = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
    const fallbackTexture = getEarthNightTexture();

    const globePoints = [
      ...HISTORICAL_EVENTS.slice(0, 15).map((ev) => ({
        lat: ev.latitude,
        lng: ev.longitude,
        name: ev.title,
        color: ev.severity === 'CRITICAL' ? '#EF4444' : '#F97316',
        frp: `${ev.frpMw} MW`,
      })),
      ...LANDING_SIGNALS.map((sig) => ({
        lat: sig.lat,
        lng: sig.lng,
        name: sig.locationName,
        color: sig.severity === 'CRITICAL' ? '#EF4444' : '#38BDF8',
        frp: `${sig.frpMw} MW`,
      }))
    ];

    // Minimal Thermal Heatmap Surface Rings on Earth
    const surfaceHeatRings = [
      { lat: 21.17, lng: 72.83, maxR: 4, propagationSpeed: 1, repeatPeriod: 1400, color: '#ef4444' }, // Gujarat Refinery
      { lat: 29.74, lng: -95.18, maxR: 5, propagationSpeed: 1.2, repeatPeriod: 1600, color: '#38bdf8' }, // Texas Refinery Flare
      { lat: 40.71, lng: -121.52, maxR: 6, propagationSpeed: 1.5, repeatPeriod: 1800, color: '#ef4444' }, // Wildfire Anomaly
      { lat: 51.95, lng: 4.14, maxR: 3.5, propagationSpeed: 0.9, repeatPeriod: 1300, color: '#f97316' }, // Rotterdam Port
      { lat: -22.34, lng: 118.53, maxR: 4.5, propagationSpeed: 1.1, repeatPeriod: 1500, color: '#a855f7' }, // Pilbara Smelter
      { lat: 31.84, lng: -102.35, maxR: 4.2, propagationSpeed: 1.0, repeatPeriod: 1700, color: '#f59e0b' } // Permian Basin
    ];

    try {
      const container = globeElRef.current;
      const width = container.clientWidth || 380;
      const height = container.clientHeight || 380;

      const world = (Globe as any)()(container)
        .width(width)
        .height(height)
        .globeImageUrl(nasaSatTexture)
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundColor('rgba(0,0,0,0)')
        .atmosphereColor('#38bdf8')
        .atmosphereAltitude(0.24)
        .ringsData(surfaceHeatRings)
        .ringColor((d: any) => d.color)
        .ringMaxRadius((d: any) => d.maxR)
        .ringPropagationSpeed((d: any) => d.propagationSpeed)
        .ringRepeatPeriod((d: any) => d.repeatPeriod)
        .htmlElementsData(globePoints)
        .htmlElement((d: any) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'group relative pointer-events-auto cursor-pointer';
          wrapper.style.transform = 'translate(-50%, -50%)';

          const beacon = document.createElement('div');
          beacon.style.width = '8px';
          beacon.style.height = '8px';
          beacon.style.borderRadius = '50%';
          beacon.style.backgroundColor = d.color;
          beacon.style.boxShadow = `0 0 10px ${d.color}`;
          wrapper.appendChild(beacon);

          if (!prefersReducedMotion) {
            const ring = document.createElement('div');
            ring.style.position = 'absolute';
            ring.style.top = '50%';
            ring.style.left = '50%';
            ring.style.transform = 'translate(-50%, -50%)';
            ring.style.width = '16px';
            ring.style.height = '16px';
            ring.style.borderRadius = '50%';
            ring.style.border = `1.5px solid ${d.color}`;
            ring.className = 'animate-ping opacity-75';
            wrapper.appendChild(ring);
          }

          // Tooltip Hover
          const tooltip = document.createElement('div');
          tooltip.className = 'hidden group-hover:block absolute left-3 top-1/2 -translate-y-1/2 bg-[#040812]/95 border border-cyan-500/40 text-[10px] font-mono text-white px-2 py-1 rounded shadow-xl whitespace-nowrap z-50';
          tooltip.innerHTML = `<span style="color: ${d.color}; font-weight: bold;">●</span> ${d.name} <span class="text-slate-400">(${d.frp})</span>`;
          wrapper.appendChild(tooltip);

          return wrapper;
        });

      // Fallback texture handler
      const img = new Image();
      img.onerror = () => world.globeImageUrl(fallbackTexture);
      img.src = nasaSatTexture;

      // Camera & Continuous Auto-Rotation Setup
      world.pointOfView({ lat: 21.17, lng: 72.83, altitude: 2.15 }, 0);
      world.controls().autoRotate = true;
      world.controls().autoRotateSpeed = 0.5;
      world.controls().enableZoom = true;

      // --- ADD TWO REALISTIC SATELLITES IN 90° ORTHOGONAL ORBITAL PLANES ---
      const scene = world.scene();
      let animFrameId: number;

      if (scene) {
        // Add ambient light & directional light for metallic specular mirror reflections on satellites
        const satLight = new THREE.DirectionalLight(0xffffff, 2.2);
        satLight.position.set(160, 120, 220);
        scene.add(satLight);
        const satAmbLight = new THREE.AmbientLight(0xffffff, 0.7);
        scene.add(satAmbLight);

        // --- SATELLITE 1: SUOMI-NPP VIIRS (Aerospace Titanium Grey MLI + Real Mirror Solar Wings) ---
        const createSuomiNppSatellite = (beamColorHex: number, orbitRadius: number) => {
          const satGroup = new THREE.Group();

          const titaniumGreyBusMat = new THREE.MeshPhongMaterial({ color: 0x64748b, specular: 0xe2e8f0, shininess: 140 });
          const silverMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, specular: 0xffffff, shininess: 180 });
          const chromeTrimMat = new THREE.MeshPhongMaterial({ color: 0xcbd5e1, specular: 0xffffff, shininess: 160 });
          
          const mirrorSolarMat = new THREE.MeshPhongMaterial({
            color: 0x07152e,
            specular: 0xffffff,
            shininess: 260,
            reflectivity: 0.95,
          });

          const lensMat = new THREE.MeshPhongMaterial({
            color: beamColorHex,
            specular: 0xffffff,
            shininess: 200,
            transparent: true,
            opacity: 0.9,
          });

          const busGeo = new THREE.BoxGeometry(3.8, 3.8, 5.8);
          const busMesh = new THREE.Mesh(busGeo, titaniumGreyBusMat);
          satGroup.add(busMesh);

          const foilStripGeo = new THREE.BoxGeometry(4.0, 0.4, 6.0);
          const foilStrip = new THREE.Mesh(foilStripGeo, chromeTrimMat);
          satGroup.add(foilStrip);

          [-1, 1].forEach((dir) => {
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 12), silverMat);
            strut.rotation.z = Math.PI / 2;
            strut.position.set(dir * 3.9, 0, 0);
            satGroup.add(strut);

            const panelGeo = new THREE.BoxGeometry(9.6, 0.28, 4.2);
            const panelMesh = new THREE.Mesh(panelGeo, mirrorSolarMat);
            panelMesh.position.set(dir * 9.8, 0, 0);

            const gridGeo = new THREE.BoxGeometry(9.7, 0.3, 4.3);
            const gridMat = new THREE.MeshBasicMaterial({
              color: 0x38bdf8,
              wireframe: true,
              transparent: true,
              opacity: 0.35,
            });
            panelMesh.add(new THREE.Mesh(gridGeo, gridMat));
            satGroup.add(panelMesh);
          });

          const sensorHousingGeo = new THREE.CylinderGeometry(1.6, 1.3, 2.8, 20);
          const sensorHousingMesh = new THREE.Mesh(sensorHousingGeo, titaniumGreyBusMat);
          sensorHousingMesh.position.set(0, 0, 3.8);
          sensorHousingMesh.rotation.x = Math.PI / 2;

          const lensGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.25, 20);
          const lensMesh = new THREE.Mesh(lensGeo, lensMat);
          lensMesh.position.set(0, 1.35, 0);
          sensorHousingMesh.add(lensMesh);
          satGroup.add(sensorHousingMesh);

          const beamDistance = orbitRadius - 100;
          const beamGeo = new THREE.CylinderGeometry(0.6, 9.0, beamDistance, 32, 1, true);
          beamGeo.rotateX(Math.PI / 2);
          beamGeo.translate(0, 0, beamDistance / 2);

          const beamMat = new THREE.MeshBasicMaterial({
            color: beamColorHex,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
          });
          satGroup.add(new THREE.Mesh(beamGeo, beamMat));

          const scanFootprintGroup = new THREE.Group();
          scanFootprintGroup.position.set(0, 0, beamDistance);

          const ringGeo = new THREE.RingGeometry(7.0, 9.0, 32);
          const scanFootprintMat = new THREE.MeshBasicMaterial({
            color: beamColorHex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
          });
          scanFootprintGroup.add(new THREE.Mesh(ringGeo, scanFootprintMat));
          satGroup.add(scanFootprintGroup);

          return { satGroup, beamMat, scanFootprintMat };
        };

        // --- SATELLITE 2: COMMUNICATION SATELLITE (Pristine White/Silver MLI + Dual Dishes + Mirror Wings) ---
        const createCommunicationSatellite = (beamColorHex: number, orbitRadius: number) => {
          const satGroup = new THREE.Group();

          const whiteBusMat = new THREE.MeshPhongMaterial({ color: 0xf8fafc, specular: 0xffffff, shininess: 150 });
          const chromeDishMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, specular: 0xffffff, shininess: 220 });
          const titaniumAccentMat = new THREE.MeshPhongMaterial({ color: 0x64748b, specular: 0xcbd5e1, shininess: 160 });
          const silverStrutMat = new THREE.MeshPhongMaterial({ color: 0xcbd5e1, specular: 0xffffff, shininess: 180 });
          const thrusterMat = new THREE.MeshPhongMaterial({ color: 0x334155, specular: 0x94a3b8, shininess: 120 });

          const comMirrorSolarMat = new THREE.MeshPhongMaterial({
            color: 0x0284c7,
            specular: 0xffffff,
            shininess: 260,
            reflectivity: 0.95,
          });

          const busGeo = new THREE.BoxGeometry(4.2, 3.4, 6.2);
          const busMesh = new THREE.Mesh(busGeo, whiteBusMat);
          satGroup.add(busMesh);

          const skirtGeo = new THREE.BoxGeometry(4.4, 0.45, 6.4);
          const skirtMesh = new THREE.Mesh(skirtGeo, titaniumAccentMat);
          satGroup.add(skirtMesh);

          [-1, 1].forEach((dir) => {
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 4.5, 12), silverStrutMat);
            strut.rotation.z = Math.PI / 2;
            strut.position.set(dir * 4.2, 0, 0);
            satGroup.add(strut);

            const panelGeo = new THREE.BoxGeometry(11.2, 0.3, 4.5);
            const panelMesh = new THREE.Mesh(panelGeo, comMirrorSolarMat);
            panelMesh.position.set(dir * 10.5, 0, 0);

            const gridGeo = new THREE.BoxGeometry(11.3, 0.32, 4.6);
            const gridMat = new THREE.MeshBasicMaterial({
              color: 0x38bdf8,
              wireframe: true,
              transparent: true,
              opacity: 0.45,
            });
            panelMesh.add(new THREE.Mesh(gridGeo, gridMat));
            satGroup.add(panelMesh);
          });

          // PRIMARY COMMUNICATION DISH ANTENNA 1
          const dishBoom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.5, 8), silverStrutMat);
          dishBoom.position.set(0, 2.8, -1.0);
          dishBoom.rotation.x = -Math.PI / 4;
          satGroup.add(dishBoom);

          const dishGeo1 = new THREE.SphereGeometry(2.6, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.44);
          const dishMesh1 = new THREE.Mesh(dishGeo1, chromeDishMat);
          dishMesh1.position.set(0, 3.8, -2.0);
          dishMesh1.rotation.x = Math.PI * 0.65;

          const feedHorn1 = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.0, 8), titaniumAccentMat);
          feedHorn1.position.set(0, 1.0, 0);
          dishMesh1.add(feedHorn1);
          satGroup.add(dishMesh1);

          // SECONDARY FEEDER LINK DISH ANTENNA 2
          const dishGeo2 = new THREE.SphereGeometry(2.0, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.40);
          const dishMesh2 = new THREE.Mesh(dishGeo2, chromeDishMat);
          dishMesh2.position.set(2.8, 0, 2.0);
          dishMesh2.rotation.y = Math.PI / 3;

          const feedHorn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), titaniumAccentMat);
          feedHorn2.position.set(0, 0.8, 0);
          dishMesh2.add(feedHorn2);
          satGroup.add(dishMesh2);

          // RCS Rocket Nozzles
          [-1.8, 1.8].forEach((x) => {
            [-2.6, 2.6].forEach((z) => {
              const thruster = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 12), thrusterMat);
              thruster.position.set(x, -2.0, z);
              thruster.rotation.x = Math.PI;
              satGroup.add(thruster);
            });
          });

          const beamDistance = orbitRadius - 100;
          const beamGeo = new THREE.CylinderGeometry(0.6, 9.0, beamDistance, 32, 1, true);
          beamGeo.rotateX(Math.PI / 2);
          beamGeo.translate(0, 0, beamDistance / 2);

          const beamMat = new THREE.MeshBasicMaterial({
            color: beamColorHex,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
          });
          satGroup.add(new THREE.Mesh(beamGeo, beamMat));

          const scanFootprintGroup = new THREE.Group();
          scanFootprintGroup.position.set(0, 0, beamDistance);

          const ringGeo = new THREE.RingGeometry(7.0, 9.0, 32);
          const scanFootprintMat = new THREE.MeshBasicMaterial({
            color: beamColorHex,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
          });
          scanFootprintGroup.add(new THREE.Mesh(ringGeo, scanFootprintMat));
          satGroup.add(scanFootprintGroup);

          return { satGroup, beamMat, scanFootprintMat };
        };

        // --- SATELLITE 1: SUOMI-NPP (Polar Orbit - Inner Orbital Shell Radius = 118) ---
        const orbitRadius1 = 118;
        const orbitTrackGroup1 = new THREE.Group();
        orbitTrackGroup1.rotation.set(Math.PI / 2, 0, Math.PI * 0.1);

        const curve1 = new THREE.EllipseCurve(0, 0, orbitRadius1, orbitRadius1, 0, 2 * Math.PI, false, 0);
        const points1 = curve1.getPoints(120);
        const trackGeo1 = new THREE.BufferGeometry().setFromPoints(points1.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const trackMat1 = new THREE.LineDashedMaterial({
          color: 0x38bdf8,
          linewidth: 1,
          scale: 1,
          dashSize: 3,
          gapSize: 3,
          transparent: true,
          opacity: 0.45
        });
        const trackLine1 = new THREE.Line(trackGeo1, trackMat1);
        trackLine1.computeLineDistances();
        orbitTrackGroup1.add(trackLine1);
        scene.add(orbitTrackGroup1);

        const satPivot1 = new THREE.Group();
        satPivot1.rotation.set(Math.PI / 2, 0, Math.PI * 0.1);
        const sat1 = createSuomiNppSatellite(0x38bdf8, orbitRadius1);
        satPivot1.add(sat1.satGroup);
        scene.add(satPivot1);

        // --- SATELLITE 2: COMMUNICATION SATELLITE (Outer Orbital Shell Radius = 140 - Farther Apart!) ---
        const orbitRadius2 = 140;
        const orbitTrackGroup2 = new THREE.Group();
        orbitTrackGroup2.rotation.set(0, Math.PI * 0.15, Math.PI / 2);

        const curve2 = new THREE.EllipseCurve(0, 0, orbitRadius2, orbitRadius2, 0, 2 * Math.PI, false, 0);
        const points2 = curve2.getPoints(120);
        const trackGeo2 = new THREE.BufferGeometry().setFromPoints(points2.map(p => new THREE.Vector3(p.x, 0, p.y)));
        const trackMat2 = new THREE.LineDashedMaterial({
          color: 0x38bdf8,
          linewidth: 1,
          scale: 1,
          dashSize: 3,
          gapSize: 3,
          transparent: true,
          opacity: 0.45
        });
        const trackLine2 = new THREE.Line(trackGeo2, trackMat2);
        trackLine2.computeLineDistances();
        orbitTrackGroup2.add(trackLine2);
        scene.add(orbitTrackGroup2);

        const satPivot2 = new THREE.Group();
        satPivot2.rotation.set(0, Math.PI * 0.15, Math.PI / 2);
        const sat2 = createCommunicationSatellite(0x38bdf8, orbitRadius2);
        satPivot2.add(sat2.satGroup);
        scene.add(satPivot2);

        // --- RAYCASTING CLICK HANDLER FOR 3D SATELLITE MESHES ---
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const onCanvasClick = (event: MouseEvent) => {
          if (!container) return;
          const rect = container.getBoundingClientRect();
          mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

          const camera = world.camera();
          if (!camera) return;

          raycaster.setFromCamera(mouse, camera);

          const intersects1 = raycaster.intersectObjects(sat1.satGroup.children, true);
          if (intersects1.length > 0) {
            setSelectedSatellite(SATELLITE_DOSSIERS.SUOMI_NPP);
            return;
          }

          const intersects2 = raycaster.intersectObjects(sat2.satGroup.children, true);
          if (intersects2.length > 0) {
            setSelectedSatellite(SATELLITE_DOSSIERS.NOAA_20);
            return;
          }
        };

        container.addEventListener('click', onCanvasClick);

        // --- ANIMATION LOOP: Opposing Directions & 180° Initial Offset ---
        let satAngle1 = 0;
        let satAngle2 = Math.PI; // 180° initial offset phase (on opposite sides of Earth!)

        const animateSatellites = () => {
          satAngle1 += 0.0024;  // Orbit 1 rotates Forward
          satAngle2 -= 0.0024;  // Orbit 2 rotates in REVERSE / OPPOSITE direction!

          const satX1 = Math.cos(satAngle1) * orbitRadius1;
          const satZ1 = Math.sin(satAngle1) * orbitRadius1;
          sat1.satGroup.position.set(satX1, 0, satZ1);
          sat1.satGroup.lookAt(0, 0, 0);
          sat1.beamMat.opacity = 0.20 + Math.sin(satAngle1 * 6) * 0.07;

          const satX2 = Math.cos(satAngle2) * orbitRadius2;
          const satZ2 = Math.sin(satAngle2) * orbitRadius2;
          sat2.satGroup.position.set(satX2, 0, satZ2);
          sat2.satGroup.lookAt(0, 0, 0);
          sat2.beamMat.opacity = 0.20 + Math.cos(satAngle2 * 5) * 0.07;

          animFrameId = requestAnimationFrame(animateSatellites);
        };
        animateSatellites();
      }

      // Resume auto-rotation after user interaction
      let interactTimeout: ReturnType<typeof setTimeout>;
      const controls = world.controls();
      controls.addEventListener('start', () => {
        controls.autoRotate = false;
        clearTimeout(interactTimeout);
      });
      controls.addEventListener('end', () => {
        interactTimeout = setTimeout(() => {
          controls.autoRotate = true;
        }, 2500);
      });

      globeInstanceRef.current = world;

      const handleResize = () => {
        if (globeInstanceRef.current && globeElRef.current) {
          const w = globeElRef.current.clientWidth || 380;
          const h = globeElRef.current.clientHeight || 380;
          globeInstanceRef.current.width(w).height(h);
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        clearTimeout(interactTimeout);
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (globeElRef.current) globeElRef.current.innerHTML = '';
      };
    } catch (e) {
      console.warn('3D Globe initialization warning:', e);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#05080E] text-slate-200 font-sans selection:bg-cyan-500/20 antialiased">
      
      {/* MINIMAL NAVBAR */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#05080E]/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm tracking-wider font-bold text-white uppercase">
              GEOFLARE <span className="text-cyan-400">AI</span>
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono">
            <a href="#the-problem" className="text-slate-400 hover:text-white transition-colors">
              The Problem
            </a>
            <a href="#context-engine" className="text-slate-400 hover:text-white transition-colors">
              Sensor Fusion
            </a>
            <a href="#signatures" className="text-slate-400 hover:text-white transition-colors">
              Classifications
            </a>
            <button
              onClick={() => navigate('/command-center')}
              className="px-3.5 py-1.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 transition-colors uppercase cursor-pointer"
            >
              Explore Operations →
            </button>
          </div>
        </div>
      </header>

      {/* BEAT 01: THE HERO */}
      <section className="relative pt-20 pb-28 border-b border-white/[0.08] px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-slate-300 text-xs font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Satellite Thermal Intelligence
            </div>

            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-white leading-[1.08]">
              Satellites see heat. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-200 to-amber-200">
                They can’t tell you what’s burning.
              </span>
            </h1>

            <p className="text-slate-400 text-base sm:text-lg max-w-xl leading-relaxed">
              Every hour, Earth observation sensors register thousands of high-temperature anomalies. 
              GeoFlare cross-references raw thermal detections with infrastructure footprints, land cover, and 180-day persistence to turn noisy pixels into classified events.
            </p>

            <div className="flex flex-wrap gap-3 pt-2 font-mono text-xs">
              <button
                onClick={() => navigate('/global-earth')}
                className="px-5 py-3 bg-gradient-to-r from-cyan-500 to-sky-600 hover:from-cyan-400 hover:to-sky-500 text-black font-bold tracking-wider uppercase rounded transition-all shadow-[0_0_25px_rgba(6,182,212,0.4)] flex items-center space-x-2 cursor-pointer"
              >
                <Globe2 className="w-4 h-4 text-black" />
                <span>Launch Orbital Earth →</span>
              </button>

              <a
                href="#context-engine"
                className="px-5 py-3 bg-white/[0.05] hover:bg-white/10 border border-white/15 text-slate-300 font-semibold tracking-wider uppercase rounded transition-all flex items-center"
              >
                See Context Engine ↓
              </a>
            </div>

            {/* Grounded Provenance */}
            <div className="pt-6 border-t border-white/[0.08] flex items-center gap-6 font-mono text-xs text-slate-400">
              <div>
                <span className="text-white font-bold">VIIRS / MODIS</span> Public Sensor Data
              </div>
              <span className="text-slate-600">/</span>
              <div>
                <span className="text-white font-bold">180-Day</span> Historical Baselines
              </div>
              <span className="text-slate-600">/</span>
              <div>
                <span className="text-white font-bold">Sub-Kilometer</span> GIS Precision
              </div>
            </div>
          </div>

          {/* 3D WebGL Globe Visualizer */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center">
            <div
              onClick={() => navigate('/global-earth')}
              className="relative w-[340px] h-[340px] sm:w-[400px] sm:h-[400px] rounded-2xl border border-cyan-500/30 bg-[#040814]/80 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.7)] group cursor-pointer hover:border-cyan-400 transition-all"
            >
              <div ref={globeElRef} className="w-full h-full cursor-pointer" />
              
              <div className="absolute top-3 left-3 font-mono text-[10px] text-cyan-400/90 bg-[#05080E]/80 px-2 py-1 rounded border border-cyan-500/30 backdrop-blur-md flex items-center gap-1.5 group-hover:bg-cyan-500/20 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                <span>3D GLOBE + INFRARED SENSOR (CLICK TO LAUNCH)</span>
              </div>
              <div className="absolute bottom-3 right-3 font-mono text-[10px] text-cyan-300 bg-[#05080E]/90 px-2.5 py-1 rounded border border-cyan-500/40 font-bold group-hover:bg-cyan-500 group-hover:text-black transition-colors flex items-center space-x-1">
                <span>OPEN 3D GLOBAL EARTH →</span>
              </div>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-3 text-center">
              Active VIIRS sensor scanning infrared heat anomalies. Click globe to launch full-screen 3D Earth view.
            </div>
          </div>

        </div>
      </section>

      {/* BEAT 02: THE PROBLEM (HEAT ALONE IS AMBIGUOUS) */}
      <section id="the-problem" className="py-24 border-b border-white/[0.08] px-6 bg-[#04070C]">
        <div className="max-w-5xl mx-auto space-y-12">
          
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <span className="font-mono text-xs text-cyan-400 uppercase tracking-widest font-semibold">
              The Spatial Dilemma
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              To a raw satellite sensor, every fire looks identical.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Standard Earth observation instruments detect thermal radiation in the 3.7μm infrared band. 
              The sensor registers a temperature value—nothing more.
            </p>
          </div>

          {/* Side-by-Side Comparison: What Satellite Sees vs What Ground Truth Is */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
            
            {/* Left: What the Satellite Sees (Rich GIS Grid & Land Contour Background) */}
            <div className="p-8 rounded-xl border border-white/10 bg-[#070C16] flex flex-col justify-between">
              <div>
                <div className="font-mono text-xs text-red-400 font-semibold mb-2">
                  RAW SATELLITE OUTPUT
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Unidentified Thermal Anomaly
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-6">
                  A 375-meter pixel emitting high radiative power. Without context, an operator has no way to know if this requires emergency evacuation or can be completely ignored.
                </p>
              </div>

              {/* Spatial Hotspot Visualizer with Faint GIS Coastline & Asset Grid Background */}
              <div className="h-52 rounded-lg bg-[#040810] border border-white/10 flex flex-col items-center justify-center relative overflow-hidden">
                {/* Vector GIS Map Background Overlay */}
                <svg className="absolute inset-0 w-full h-full opacity-25 pointer-events-none" viewBox="0 0 400 200">
                  <path d="M 20,80 Q 90,30 160,90 T 320,60 T 380,120" fill="none" stroke="rgba(56,189,248,0.4)" strokeWidth="1.5" strokeDasharray="4 4" />
                  <path d="M 40,150 Q 120,110 210,160 T 360,140" fill="none" stroke="rgba(56,189,248,0.25)" strokeWidth="1" />
                  <rect x="140" y="50" width="120" height="90" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3 3" />
                  <circle cx="200" cy="95" r="35" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  {/* Grid Lines */}
                  <line x1="0" y1="95" x2="400" y2="95" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                  <line x1="200" y1="0" x2="200" y2="200" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
                </svg>

                {/* Thermal Hotspot Bloom sitting ON TOP of GIS Map */}
                <div className="w-20 h-20 rounded-full bg-red-500/25 animate-ping absolute" />
                <div className="w-10 h-10 rounded-full bg-amber-500/60 blur-sm relative" />
                <div className="w-3.5 h-3.5 rounded-full bg-white relative shadow-[0_0_15px_#ffffff]" />
                
                <div className="absolute bottom-3 font-mono text-[11px] text-slate-300 bg-black/80 px-2.5 py-1 rounded border border-white/10 z-10">
                  LAT: 29.742° N · TEMP: 1,140°C · STATUS: UNKNOWN
                </div>
              </div>
            </div>

            {/* Right: Ground Truth Reality */}
            <div className="p-8 rounded-xl border border-white/10 bg-[#070C16] flex flex-col justify-between">
              <div>
                <div className="font-mono text-xs text-cyan-400 font-semibold mb-2">
                  THE GROUND TRUTH REALITY
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Four Radically Different Events
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Depending strictly on surrounding infrastructure and operational history, that exact same pixel could be:
                </p>
              </div>

              <div className="space-y-2.5 font-mono text-xs">
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/5 flex justify-between items-center">
                  <span className="text-white">A permitted refinery flare stack</span>
                  <span className="text-cyan-400 text-[11px]">→ Routine / Suppress</span>
                </div>
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/5 flex justify-between items-center">
                  <span className="text-white">An uncontrolled chemical storage fire</span>
                  <span className="text-red-400 text-[11px]">→ Plant Evacuation</span>
                </div>
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/5 flex justify-between items-center">
                  <span className="text-white">A fast-moving wildland perimeter</span>
                  <span className="text-amber-400 text-[11px]">→ Emergency Dispatch</span>
                </div>
                <div className="p-2.5 rounded bg-white/[0.02] border border-white/5 flex justify-between items-center">
                  <span className="text-white">A seasonal crop stubble burn</span>
                  <span className="text-emerald-400 text-[11px]">→ Permitted Land Use</span>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* BEAT 03: THE CONTEXTUAL SENSOR FUSION ENGINE */}
      <section id="context-engine" className="py-24 border-b border-white/[0.08] px-6 bg-[#060A12]">
        <div className="max-w-5xl mx-auto space-y-10">
          
          <div className="space-y-2 text-center max-w-3xl mx-auto">
            <span className="font-mono text-xs text-cyan-400 uppercase tracking-widest font-semibold px-3 py-1 rounded bg-cyan-950/60 border border-cyan-500/30">
              [ CONTEXTUAL SENSOR FUSION ENGINE ]
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mt-2">
              From Ambiguous Hotspot to Confirmed Operational Event
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
              A 375m satellite pixel contains zero context. Watch how layering cadastral plant boundaries, land cover classification, and 180-day thermal baselines resolves signal ambiguity in real time.
            </p>
          </div>

          {/* Interactive Step-by-Step Resolution Terminal */}
          <div className="rounded-xl border border-white/15 bg-[#070D18] shadow-2xl overflow-hidden">
            
            {/* Step Progress Stepper Bar */}
            <div className="p-4 border-b border-white/10 bg-white/[0.02] grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => setActiveLayers(['thermal'])}
                className={`p-3 rounded-lg text-left transition-all border cursor-pointer ${
                  activeLayers.length === 1
                    ? 'bg-amber-500/15 border-amber-500/60 text-white shadow-lg'
                    : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between font-mono text-[10px] text-amber-400 font-bold mb-1">
                  <span>STAGE 01</span>
                  <span>18% CONFIDENCE</span>
                </div>
                <div className="font-bold text-xs text-white">1. Raw Thermal Detection</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">375m MWIR Pixel (1,120°C)</div>
              </button>

              <button
                onClick={() => setActiveLayers(['thermal', 'infrastructure'])}
                className={`p-3 rounded-lg text-left transition-all border cursor-pointer ${
                  activeLayers.includes('infrastructure') && !activeLayers.includes('history')
                    ? 'bg-sky-500/15 border-sky-500/60 text-white shadow-lg'
                    : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between font-mono text-[10px] text-sky-400 font-bold mb-1">
                  <span>STAGE 02</span>
                  <span>65% CONFIDENCE</span>
                </div>
                <div className="font-bold text-xs text-white">2. Infrastructure Registry</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">+ Deer Park SEZ Polygon</div>
              </button>

              <button
                onClick={() => setActiveLayers(['thermal', 'infrastructure', 'history'])}
                className={`p-3 rounded-lg text-left transition-all border cursor-pointer ${
                  activeLayers.includes('history')
                    ? 'bg-emerald-500/15 border-emerald-500/60 text-white shadow-lg'
                    : 'bg-white/[0.02] border-white/5 text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between font-mono text-[10px] text-emerald-400 font-bold mb-1">
                  <span>STAGE 03</span>
                  <span>99.4% CONFIDENCE</span>
                </div>
                <div className="font-bold text-xs text-white">3. 180-Day Recurrence Audit</div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">+ Flare Stack Baseline</div>
              </button>
            </div>

            {/* Stage Viewport Container */}
            <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              
              {/* Left Column: High-Density Satellite GIS Viewport */}
              <div className="lg:col-span-6 h-80 rounded-lg bg-[#03060C] border border-white/15 relative overflow-hidden flex flex-col justify-between p-4 shadow-inner">
                
                {/* Simulated High-Resolution Industrial Plant GIS Map Basemap */}
                <svg className="absolute inset-0 w-full h-full opacity-35 pointer-events-none" viewBox="0 0 500 350">
                  <defs>
                    <pattern id="gisGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#gisGrid)" />
                  
                  {/* Plant Access Roads & Internal Perimeter Vector Lines */}
                  <path d="M 40,280 L 180,280 L 250,180 L 460,180" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                  <path d="M 180,280 L 180,60 L 420,60" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeDasharray="4 4" />
                  
                  {/* Storage Tank Structures */}
                  <circle cx="100" cy="120" r="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  <circle cx="160" cy="120" r="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  <circle cx="100" cy="180" r="24" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  
                  {/* Petrochemical Complex Building Blocks */}
                  <rect x="240" y="80" width="70" height="45" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  <rect x="330" y="80" width="80" height="55" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                  
                  {/* Flare Stack Coordinates Target Point */}
                  <circle cx="280" cy="200" r="6" fill="none" stroke="#38bdf8" strokeWidth="1.5" />
                  <line x1="280" y1="185" x2="280" y2="215" stroke="#38bdf8" strokeWidth="1" />
                  <line x1="265" y1="200" x2="295" y2="200" stroke="#38bdf8" strokeWidth="1" />
                </svg>

                {/* HUD Top Lat/Long Coordinate Banner */}
                <div className="relative z-10 flex justify-between items-center font-mono text-[10px]">
                  <div className="bg-black/80 px-2.5 py-1 rounded border border-white/10 text-cyan-400">
                    LAT: 29.7420° N · LNG: 95.1802° W · DEER PARK, TX
                  </div>
                  <div className="bg-black/80 px-2.5 py-1 rounded border border-white/10 text-slate-400">
                    ZOOM: 1:5,000 GIS
                  </div>
                </div>

                {/* Center Visual Map Overlays */}
                <div className="relative inset-0 my-auto flex items-center justify-center pointer-events-none z-10">
                  
                  {/* Stage 1: Raw Thermal Infrared Pixel */}
                  <div className="relative flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-amber-500/35 blur-xl animate-pulse" />
                    <div className="w-10 h-10 rounded-full bg-amber-400/70 blur-md absolute" />
                    <div className="w-4 h-4 rounded-full bg-white shadow-[0_0_20px_#ffffff] absolute" />
                    
                    {!activeLayers.includes('infrastructure') && (
                      <div className="absolute top-12 bg-amber-950/90 border border-amber-500/60 text-amber-300 font-mono text-[10px] px-2.5 py-1 rounded whitespace-nowrap shadow-xl">
                        375m SATELLITE PIXEL: 1,120°C [UNCLASSIFIED]
                      </div>
                    )}
                  </div>

                  {/* Stage 2: Cadastral Plant Boundary Polygon Overlay */}
                  {activeLayers.includes('infrastructure') && (
                    <div className="absolute w-72 h-48 border-2 border-cyan-400/80 border-dashed rounded-lg bg-cyan-500/10 transition-all flex flex-col justify-between p-3 pointer-events-none">
                      <div className="flex justify-between items-start font-mono text-[9px]">
                        <span className="bg-black/90 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/40 font-bold">
                          REGISTERED CADASTRAL PERIMETER
                        </span>
                        <span className="bg-black/90 text-slate-300 px-2 py-0.5 rounded border border-white/10">
                          DEER PARK SEZ (ID: PETRO-TX-84)
                        </span>
                      </div>
                      <div className="font-mono text-[9px] text-cyan-400 bg-black/90 px-2 py-0.5 rounded border border-cyan-500/40 self-end">
                        MATCH: FLARE STACK #2 (0m OFFSET)
                      </div>
                    </div>
                  )}

                  {/* Stage 3: 180-Day Recurrence Radar Ring Overlay */}
                  {activeLayers.includes('history') && (
                    <div className="absolute flex items-center justify-center pointer-events-none">
                      <div className="w-44 h-44 border-2 border-emerald-400/60 rounded-full animate-spin-slow" />
                      <div className="w-56 h-56 border border-emerald-500/25 rounded-full" />
                      <div className="absolute top-[-20px] bg-emerald-950/90 border border-emerald-500/60 text-emerald-300 font-mono text-[10px] px-2.5 py-1 rounded whitespace-nowrap shadow-xl font-bold">
                        180-DAY PERSISTENCE: 148 OF 180 NIGHTS ACTIVE
                      </div>
                    </div>
                  )}

                </div>

                {/* HUD Bottom Status Banner */}
                <div className="relative z-10 flex justify-between items-center font-mono text-[10px]">
                  <div className="bg-black/80 px-2.5 py-1 rounded border border-white/10 text-slate-300">
                    TARGET: <span className="text-white font-bold">DEER_PARK_REFINERY_STACK_2</span>
                  </div>
                  <div className="bg-black/80 px-2.5 py-1 rounded border border-white/10 text-cyan-400">
                    {activeLayers.includes('history') ? 'HISTORICAL BASELINE VERIFIED' : 'AUDIT IN PROGRESS'}
                  </div>
                </div>

              </div>

              {/* Right Column: Structured Signal Decomposition & Verdict */}
              <div className="lg:col-span-6 space-y-5 font-mono">
                
                {/* Confidence Bar */}
                <div>
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="text-slate-400 font-bold uppercase">CLASSIFICATION CONFIDENCE</span>
                    <span className="font-bold text-sm">
                      {activeLayers.length === 1 && <span className="text-amber-400">18% (Ambiguous Signal)</span>}
                      {activeLayers.includes('infrastructure') && !activeLayers.includes('history') && <span className="text-sky-300">65% (Inside Plant Polygon)</span>}
                      {activeLayers.includes('history') && <span className="text-emerald-400">99.4% (Confirmed Flare Stack)</span>}
                    </span>
                  </div>

                  <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full transition-all duration-700 rounded-full"
                      style={{
                        width: activeLayers.length === 1 ? '18%' : activeLayers.includes('history') ? '99.4%' : '65%',
                        backgroundColor: activeLayers.length === 1 ? '#f59e0b' : activeLayers.includes('history') ? '#10b981' : '#38bdf8',
                        boxShadow: activeLayers.includes('history') ? '0 0 15px #10b981' : '0 0 15px #38bdf8'
                      }}
                    />
                  </div>
                </div>

                {/* Multi-Source Telemetry Breakdown Table */}
                <div className="space-y-2 text-xs">
                  <div className="p-2.5 rounded bg-white/[0.03] border border-white/10 flex justify-between items-center">
                    <span className="text-slate-400">📡 Infrared Spectrum:</span>
                    <span className="text-white font-bold">3.74 µm Band · 1,120°C</span>
                  </div>

                  <div className={`p-2.5 rounded transition-all border flex justify-between items-center ${
                    activeLayers.includes('infrastructure') ? 'bg-sky-500/10 border-sky-400/40 text-sky-200' : 'bg-white/[0.01] border-white/5 text-slate-500'
                  }`}>
                    <span>🏭 GIS Cadastral Match:</span>
                    <span className="font-bold">
                      {activeLayers.includes('infrastructure') ? 'Deer Park Refinery (0m Offset)' : 'UNCHECKED'}
                    </span>
                  </div>

                  <div className={`p-2.5 rounded transition-all border flex justify-between items-center ${
                    activeLayers.includes('history') ? 'bg-emerald-500/10 border-emerald-400/40 text-emerald-200' : 'bg-white/[0.01] border-white/5 text-slate-500'
                  }`}>
                    <span>📅 180-Day Recurrence:</span>
                    <span className="font-bold">
                      {activeLayers.includes('history') ? '82.2% Night-Time Persistence' : 'UNCHECKED'}
                    </span>
                  </div>
                </div>

                {/* Operational Verdict Box */}
                <div className={`p-4 rounded-lg border transition-all ${
                  activeLayers.includes('history')
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : activeLayers.includes('infrastructure')
                    ? 'bg-sky-950/40 border-sky-500/50 text-sky-200'
                    : 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                }`}>
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">AUTOMATED OPERATIONAL VERDICT:</div>
                  <div className="text-sm font-bold mb-1">
                    {activeLayers.length === 1 && '⚠️ UNCLASSIFIED WARNING · HIGH FALSE ALARM RISK'}
                    {activeLayers.includes('infrastructure') && !activeLayers.includes('history') && '🔍 IN-FACILITY HOTSPOT · PENDING RECURRENCE CHECK'}
                    {activeLayers.includes('history') && '✓ AUTOMATIC SUPPRESSION: ROUTINE RELIEF FLARE'}
                  </div>
                  <p className="text-xs text-slate-300 font-sans leading-relaxed">
                    {activeLayers.length === 1 && 'Raw satellite thermal data alone cannot distinguish a flare stack from an uncontained structural fire. Dispatching emergency teams without context causes costly false alarms.'}
                    {activeLayers.includes('infrastructure') && !activeLayers.includes('history') && 'The heat source is confirmed inside Deer Park Refinery boundaries, but we must verify if this thermal emission is a routine operational flare or an emergency flare stack trip.'}
                    {activeLayers.includes('history') && 'Coordinates match permitted flare stack #2 and active thermal persistence over 148 of 180 nights confirms routine relief flaring. Emergency dispatch is automatically silenced.'}
                  </p>
                </div>

                {/* Interactive Step Navigation Controls */}
                <div className="flex justify-between items-center pt-2 font-mono text-xs">
                  {activeLayers.length === 1 && (
                    <button
                      onClick={() => setActiveLayers(['thermal', 'infrastructure'])}
                      className="w-full py-2.5 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] cursor-pointer"
                    >
                      Step 2: Apply Infrastructure Registry →
                    </button>
                  )}
                  {activeLayers.includes('infrastructure') && !activeLayers.includes('history') && (
                    <button
                      onClick={() => setActiveLayers(['thermal', 'infrastructure', 'history'])}
                      className="w-full py-2.5 rounded bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] cursor-pointer"
                    >
                      Step 3: Audit 180-Day Thermal Baseline →
                    </button>
                  )}
                  {activeLayers.includes('history') && (
                    <button
                      onClick={() => setActiveLayers(['thermal'])}
                      className="w-full py-2.5 rounded border border-white/20 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      ↺ Restart Resolution Demo
                    </button>
                  )}
                </div>

              </div>

            </div>

          </div>

        </div>
      </section>

      {/* BEAT 04: THE 5 SIGNATURES (WITH RESTORED VISUAL FLIR SENSOR VIEWPORT) */}
      <section id="signatures" className="py-24 border-b border-white/[0.08] px-6 bg-[#05080E]">
        <div className="max-w-5xl mx-auto space-y-10">
          
          <div>
            <span className="font-mono text-xs text-cyan-400 uppercase tracking-widest font-semibold">
              [ SIGNATURE PROFILES ]
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mt-1">
              Five distinct operational events.
            </h2>
            <p className="text-slate-400 text-sm max-w-xl mt-1">
              How GeoFlare’s contextual model discriminates between industrial and environmental thermal events.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left Column: Signature Selector List */}
            <div className="lg:col-span-5 space-y-2">
              {SIGNATURES.map((sig) => {
                const isSelected = selectedSig.id === sig.id;
                return (
                  <button
                    key={sig.id}
                    onClick={() => setSelectedSig(sig)}
                    className={`w-full text-left p-4 rounded-lg transition-all border cursor-pointer ${
                      isSelected
                        ? 'bg-white/[0.06] border-cyan-400/50 text-white shadow-lg'
                        : 'bg-white/[0.01] border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-sm text-white">{sig.name}</span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold"
                        style={{
                          backgroundColor: `${sig.verdictColor}15`,
                          color: sig.verdictColor,
                          border: `1px solid ${sig.verdictColor}40`,
                        }}
                      >
                        {sig.verdict}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">{sig.category}</div>
                  </button>
                );
              })}
            </div>

            {/* Right Column: Visual FLIR Thermal Sensor Viewport + Clear Explanations */}
            <div className="lg:col-span-7 p-6 sm:p-7 rounded-xl border border-white/10 bg-[#070D18] space-y-6">
              
              <div className="border-b border-white/10 pb-3 flex justify-between items-center font-mono text-xs">
                <div>
                  <span className="text-slate-500">SELECTED TARGET:</span>{' '}
                  <span className="text-white font-bold">{selectedSig.name.toUpperCase()}</span>
                </div>
                <div className="text-slate-400">{selectedSig.sampleLocation}</div>
              </div>

              {/* Restored Visual FLIR Thermal Sensor Viewport */}
              <div className="relative h-52 w-full rounded-lg border border-white/10 bg-black/80 overflow-hidden flex items-center justify-center">
                
                {/* Corner reticle HUD ticks */}
                <div className="absolute top-2 left-2 text-cyan-500/50 font-mono text-[9px]">┌ FLIR-CH4</div>
                <div className="absolute top-2 right-2 text-cyan-500/50 font-mono text-[9px]">┐ 3.74µm</div>
                <div className="absolute bottom-2 left-2 text-cyan-500/50 font-mono text-[9px]">└ 14-BIT</div>
                <div className="absolute bottom-2 right-2 text-cyan-500/50 font-mono text-[9px]">┘ 375M RES</div>

                {/* Thermal Gradient Heat Bloom */}
                <div 
                  className="w-40 h-40 rounded-full transition-all duration-700 blur-2xl opacity-70 animate-pulse"
                  style={{ backgroundColor: selectedSig.heatColors[0] }}
                />
                <div 
                  className="absolute w-24 h-24 rounded-full transition-all duration-700 blur-md opacity-85"
                  style={{ backgroundColor: selectedSig.heatColors[1] }}
                />
                <div className="absolute w-5 h-5 rounded-full bg-white shadow-[0_0_18px_#ffffff]" />

                {/* Target Crosshairs */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                  <div className="w-28 h-28 border border-dashed border-cyan-400 rounded-full animate-spin-slow" />
                  <div className="absolute w-44 h-[1px] bg-cyan-400" />
                  <div className="absolute h-44 w-[1px] bg-cyan-400" />
                </div>

                {/* Viewport Meta Legend */}
                <div className="absolute bottom-3 left-3 bg-black/80 px-2.5 py-1 rounded border border-white/10 font-mono text-[10px] text-slate-300">
                  PEAK TEMP: <span className="text-amber-400 font-bold">{selectedSig.temp}</span>
                </div>
                <div className="absolute bottom-3 right-3 bg-black/80 px-2.5 py-1 rounded border border-white/10 font-mono text-[10px] text-slate-300">
                  RADIATIVE POWER: <span className="text-white font-bold">{selectedSig.power}</span>
                </div>
              </div>

              {/* Explanatory Cards */}
              <div className="space-y-4 text-xs">
                <div>
                  <div className="font-mono text-[11px] text-cyan-400 font-bold uppercase mb-1">
                    The Ground Event:
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans text-sm">
                    {selectedSig.summary}
                  </p>
                </div>

                <div>
                  <div className="font-mono text-[11px] text-cyan-400 font-bold uppercase mb-1">
                    How GeoFlare Verifies It:
                  </div>
                  <p className="text-slate-300 leading-relaxed font-sans text-sm">
                    {selectedSig.howItWorks}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded bg-black/50 border border-white/10 flex items-center justify-between font-mono text-xs">
                <span className="text-slate-400">SYSTEM VERDICT:</span>
                <span 
                  className="font-bold px-2 py-0.5 rounded text-[11px]"
                  style={{
                    backgroundColor: `${selectedSig.verdictColor}20`,
                    color: selectedSig.verdictColor,
                    border: `1px solid ${selectedSig.verdictColor}40`
                  }}
                >
                  {selectedSig.verdict}
                </span>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* BEAT 05: GROUNDED PLATFORM RADAR CONSOLE PREVIEW */}
      <section className="py-24 border-b border-white/[0.08] px-6 bg-[#04070C]">
        <div className="max-w-5xl mx-auto space-y-10">
          
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="font-mono text-xs text-cyan-400 uppercase tracking-widest font-semibold">
              [ PLATFORM RADAR CONSOLE ]
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              An operational console built for clarity.
            </h2>
            <p className="text-slate-400 text-sm">
              Instead of raw, unparsed telemetry tables, operators inspect validated event cards with spatial context overlays.
            </p>
          </div>

          {/* Console Web Container */}
          <div className="rounded-xl border border-white/15 bg-[#070C16] shadow-2xl overflow-hidden">
            
            {/* Window Top Bar */}
            <div className="h-10 bg-white/[0.03] border-b border-white/10 px-4 flex items-center justify-between">
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                geoflare-operations // regional-inspector
              </div>
              <div className="font-mono text-[11px] text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>32 ANOMALIES AUDITED</span>
              </div>
            </div>

            {/* Console Body Preview with Rich Multi-Point Radar */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              
              {/* Radar Graphic Viewport with Multiple Audited Targets */}
              <div className="md:col-span-7 h-64 rounded bg-black/80 border border-white/10 relative overflow-hidden flex items-center justify-center">
                
                {/* Concentric Radar Rings */}
                <div className="absolute w-[200px] h-[200px] border border-cyan-500/15 rounded-full" />
                <div className="absolute w-[140px] h-[140px] border border-cyan-500/20 rounded-full" />
                <div className="absolute w-[80px] h-[80px] border border-cyan-500/25 rounded-full" />
                <div className="absolute w-full h-[1px] bg-cyan-500/10" />
                <div className="absolute h-full w-[1px] bg-cyan-500/10" />

                {/* Sweeping Radar Line */}
                <div className="absolute w-32 h-32 origin-top-left top-1/2 left-1/2 bg-gradient-to-br from-cyan-400/20 to-transparent rounded-tl-full animate-spin-slow pointer-events-none" />

                {/* Active Target Event #8092 */}
                <div className="absolute top-[35%] left-[55%] group cursor-pointer z-20">
                  <div className="w-3 h-3 bg-cyan-400 rounded-full animate-ping" />
                  <div className="w-3 h-3 bg-cyan-400 rounded-full absolute inset-0" />
                  <div className="absolute left-4 top-0 bg-black/90 border border-cyan-500/40 text-[9px] font-mono px-2 py-0.5 rounded whitespace-nowrap text-white">
                    EVENT #8092 (ROUTINE FLARE)
                  </div>
                </div>

                {/* Audited Secondary Radar Points (Scatter of Cleared Facilities) */}
                <div className="absolute top-[25%] left-[30%] w-2 h-2 bg-emerald-400/80 rounded-full" />
                <div className="absolute top-[65%] left-[22%] w-2 h-2 bg-slate-500/70 rounded-full" />
                <div className="absolute top-[70%] left-[68%] w-2 h-2 bg-emerald-400/80 rounded-full" />
                <div className="absolute top-[45%] left-[78%] w-2 h-2 bg-slate-500/70 rounded-full" />
                <div className="absolute top-[20%] left-[72%] w-2 h-2 bg-amber-400/80 rounded-full" />
                <div className="absolute top-[80%] left-[42%] w-2 h-2 bg-slate-500/70 rounded-full" />
                <div className="absolute top-[32%] left-[18%] w-2 h-2 bg-emerald-400/80 rounded-full" />
                <div className="absolute top-[58%] left-[82%] w-2 h-2 bg-slate-500/70 rounded-full" />

                <div className="absolute top-3 left-3 font-mono text-[10px] text-slate-400 bg-black/60 px-2 py-1 rounded border border-white/10">
                  SECTOR: GULF COAST INDUSTRIAL
                </div>
                <div className="absolute bottom-3 right-3 font-mono text-[10px] text-cyan-400 bg-black/60 px-2 py-1 rounded border border-cyan-500/30">
                  MONITORING 32 SECTORS
                </div>
              </div>

              {/* Sample Record Preview */}
              <div className="md:col-span-5 space-y-3 font-mono text-xs">
                <div className="text-slate-400 text-[10px] uppercase">LATEST RESOLVED ANOMALY</div>
                <div className="p-3.5 rounded bg-white/[0.02] border border-white/10 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="font-bold text-white">EVENT #8092</span>
                    <span className="text-cyan-400 font-bold">ROUTINE FLARE</span>
                  </div>
                  <div className="text-slate-300 text-[11px]">Baton Rouge Refinery Complex</div>
                  <div className="text-slate-400 text-[10px]">Confidence: 99.4% · Alert Suppressed</div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => navigate('/command-center')}
                    className="w-full py-2.5 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(6,182,212,0.35)] cursor-pointer"
                  >
                    Open Live Operations Terminal →
                  </button>
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      {/* BEAT 06: CLEAN, SOBER FOOTER / EXIT */}
      <footer className="py-24 px-6 bg-gradient-to-t from-cyan-950/40 via-[#03060A] to-[#03060A] border-t border-white/10 relative overflow-hidden">
        
        {/* Background Grid Accent */}
        <div 
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(56, 189, 248, 0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(56, 189, 248, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />

        <div className="max-w-6xl mx-auto space-y-16 relative z-10">
          
          {/* Main Heroic CTA */}
          <div className="max-w-2xl mx-auto text-center space-y-6">
            <span className="font-mono text-xs uppercase tracking-widest text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded bg-cyan-950/60">
              OPERATIONAL READINESS
            </span>
            <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight">
              Turn raw heat into clear operational decisions.
            </h2>
            <p className="text-slate-400 text-sm sm:text-base leading-relaxed font-light">
              GeoFlare combines global satellite coverage with fine-grained local infrastructure registries.
            </p>
            <div className="pt-2">
              <button
                onClick={() => navigate('/command-center')}
                className="px-8 py-4 rounded bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_30px_rgba(6,182,212,0.4)] cursor-pointer"
              >
                Enter Operations Console →
              </button>
            </div>
          </div>

          {/* Professional 4-Column Footer Navigation Links */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pt-12 border-t border-white/10 font-mono text-xs text-slate-400 text-left">
            
            <div className="space-y-3">
              <div className="font-bold text-white text-sm tracking-wider">GEOFLARE AI</div>
              <p className="text-slate-500 text-[11px] leading-relaxed font-sans">
                Autonomous orbital surveillance and satellite thermal intelligence platform for industrial infrastructure.
              </p>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-white text-xs uppercase tracking-wider mb-3">PLATFORM</div>
              <div><button onClick={() => navigate('/command-center')} className="hover:text-cyan-400 transition-colors cursor-pointer">Command Center</button></div>
              <div><button onClick={() => navigate('/map-explorer')} className="hover:text-cyan-400 transition-colors cursor-pointer">Map Explorer</button></div>
              <div><button onClick={() => navigate('/mission-brief')} className="hover:text-cyan-400 transition-colors cursor-pointer">Mission Brief</button></div>
              <div><button onClick={() => navigate('/thermal-history')} className="hover:text-cyan-400 transition-colors cursor-pointer">Thermal History</button></div>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-white text-xs uppercase tracking-wider mb-3">SENSOR DATA SOURCES</div>
              <div className="text-slate-300">NOAA-20 VIIRS (3.74µm)</div>
              <div className="text-slate-300">MODIS Aqua & Terra</div>
              <div className="text-slate-300">Sentinel-3 SLSTR</div>
              <div className="text-slate-300">Copernicus EMS</div>
            </div>

            <div className="space-y-2">
              <div className="font-bold text-white text-xs uppercase tracking-wider mb-3">SYSTEM STATUS</div>
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Orbital Downlink: Active</span>
              </div>
              <div className="text-slate-400">API Latency: 240ms</div>
              <div className="text-slate-400">GIS Alignment: Sub-Meter</div>
            </div>

          </div>

          <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500 gap-4">
            <div>GEOFLARE AI · AUTONOMOUS ORBITAL SURVEILLANCE PLATFORM</div>
            <div>COMPLIANT WITH NOAA FIRMS · SENTINEL-2 SLSTR</div>
          </div>

        </div>
      </footer>

      {/* Satellite Telemetry Intelligence Modal */}
      <SatelliteDossierModal
        dossier={selectedSatellite}
        onClose={() => setSelectedSatellite(null)}
      />

    </div>
  );
}

export const LandingPage = GeoFlareLanding;

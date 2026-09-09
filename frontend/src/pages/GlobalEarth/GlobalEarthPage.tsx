import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Globe from 'globe.gl';
import * as THREE from 'three';
import {
  Compass,
  Filter,
  Flame,
  Globe2,
  MapPin,
  Radio,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { getEarthNightTexture } from '../../utils/earthTexture';
import {
  SatelliteDossierModal,
  SATELLITE_DOSSIERS,
  type SatelliteDossier,
} from '../../components/modals/SatelliteDossierModal';

type FilterMode = 'ALL' | 'INDUSTRIAL' | 'WILDLAND';

interface GlobalThermalCluster {
  id: string;
  name: string;
  category: 'industrial' | 'wildland';
  lat: number;
  lng: number;
  frpMw: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  region: string;
}

const GLOBAL_CLUSTERS: GlobalThermalCluster[] = [
  { id: 'TC-01', name: 'Surat Petrochemical Flare Zone', category: 'industrial', lat: 21.17, lng: 72.83, frpMw: 184, severity: 'CRITICAL', region: 'Gujarat Industrial Corridor' },
  { id: 'TC-02', name: 'Persian Gulf Offshore Platforms', category: 'industrial', lat: 26.50, lng: 52.20, frpMw: 820, severity: 'HIGH', region: 'Qatar / Saudi Coast' },
  { id: 'TC-03', name: 'Western US Wildland Perimeter', category: 'wildland', lat: 40.71, lng: -121.52, frpMw: 1840, severity: 'CRITICAL', region: 'Shasta-Trinity Forest' },
  { id: 'TC-04', name: 'North Sea Flare Stack Cluster', category: 'industrial', lat: 56.50, lng: 3.20, frpMw: 410, severity: 'MEDIUM', region: 'Forties Field, UK Sector' },
  { id: 'TC-05', name: 'Indian Agricultural Stubble Fires', category: 'wildland', lat: 30.90, lng: 75.85, frpMw: 280, severity: 'MEDIUM', region: 'Punjab Farmland' },
  { id: 'TC-06', name: 'Siberian Boreal Canopy Fire', category: 'wildland', lat: 62.03, lng: 129.73, frpMw: 950, severity: 'HIGH', region: 'Yakutia Forest Reserve' },
  { id: 'TC-07', name: 'Permian Basin Flare Infrastructure', category: 'industrial', lat: 31.84, lng: -102.35, frpMw: 640, severity: 'HIGH', region: 'Permian Energy Belt' },
  { id: 'TC-08', name: 'Jurong Island Refinery Network', category: 'industrial', lat: 1.27, lng: 103.69, frpMw: 520, severity: 'HIGH', region: 'Singapore Petrochem Hub' },
  { id: 'TC-09', name: 'Rotterdam Harbor Process Flare', category: 'industrial', lat: 51.95, lng: 4.14, frpMw: 390, severity: 'MEDIUM', region: 'Port of Rotterdam' },
];

interface RegionalHub {
  id: string;
  name: string;
  sectorName: string;
  lat: number;
  lng: number;
  country: string;
  status: string;
}

const REGIONAL_HUBS: RegionalHub[] = [
  { id: 'gujarat', name: 'Gujarat Sector 01', sectorName: 'Gujarat Industrial Corridor', lat: 21.17, lng: 72.83, country: 'India', status: 'ACTIVE MONITORING' },
  { id: 'houston', name: 'Houston Petrochem Complex', sectorName: 'US Gulf Coast SEZ', lat: 29.76, lng: -95.36, country: 'United States', status: 'OPERATIONAL' },
  { id: 'rotterdam', name: 'Rotterdam Port Estate', sectorName: 'EU Rhine Industrial Belt', lat: 51.95, lng: 4.14, country: 'Netherlands', status: 'OPERATIONAL' },
  { id: 'jurong', name: 'Jurong Island Hub', sectorName: 'Singapore Energy Corridor', lat: 1.27, lng: 103.69, country: 'Singapore', status: 'OPERATIONAL' },
  { id: 'permian', name: 'Permian Basin Belt', sectorName: 'Texas Energy Sector', lat: 31.84, lng: -102.35, country: 'United States', status: 'ACTIVE MONITORING' },
];

export const GlobalEarthPage: React.FC = () => {
  const navigate = useNavigate();
  
  const globeElRef = useRef<HTMLDivElement | null>(null);
  const globeInstanceRef = useRef<any>(null);

  const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
  const [selectedHub, setSelectedHub] = useState<RegionalHub | null>(null);
  const [selectedSatellite, setSelectedSatellite] = useState<SatelliteDossier | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);

  // Filtered clusters based on HUD mode
  const activeClusters = GLOBAL_CLUSTERS.filter((item) => {
    if (filterMode === 'INDUSTRIAL' && item.category !== 'industrial') return false;
    if (filterMode === 'WILDLAND' && item.category !== 'wildland') return false;
    return true;
  });

  // Handle Hub Click -> Camera Fly-In -> Navigate to 2D Operations Room
  const handleHubFlyIn = (hub: RegionalHub) => {
    setSelectedHub(hub);
    setIsTransitioning(true);

    if (globeInstanceRef.current) {
      // Animate 3D camera POV fly-in directly to hub coordinates
      globeInstanceRef.current.pointOfView(
        { lat: hub.lat, lng: hub.lng, altitude: 0.18 },
        1800
      );
    }

    setTimeout(() => {
      navigate(`/command-center?sector=${hub.id}`);
    }, 1900);
  };

  const handleResetCamera = () => {
    if (globeInstanceRef.current) {
      globeInstanceRef.current.pointOfView(
        { lat: 20.0, lng: 30.0, altitude: 2.2 },
        1200
      );
    }
  };

  // Three.js Full-Screen 3D Earth Initialization with Sun-Synchronous Polar Satellites
  useEffect(() => {
    if (!globeElRef.current) return;

    const nasaSatTexture = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
    const fallbackTexture = getEarthNightTexture();

    // Map surface heat rings based on active filter mode
    const surfaceHeatRings = activeClusters.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      maxR: c.severity === 'CRITICAL' ? 5.5 : c.severity === 'HIGH' ? 4.2 : 3.2,
      propagationSpeed: c.severity === 'CRITICAL' ? 1.4 : 1.0,
      repeatPeriod: c.severity === 'CRITICAL' ? 1200 : 1600,
      color: c.category === 'industrial' ? (c.severity === 'CRITICAL' ? '#ef4444' : '#38bdf8') : '#f97316',
    }));

    try {
      const container = globeElRef.current;
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight - 52;

      const world = (Globe as any)()(container)
        .width(width)
        .height(height)
        .globeImageUrl(nasaSatTexture)
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundColor('#04070D')
        .atmosphereColor('#38bdf8')
        .atmosphereAltitude(0.24)
        .ringsData(surfaceHeatRings)
        .ringColor((d: any) => d.color)
        .ringMaxRadius((d: any) => d.maxR)
        .ringPropagationSpeed((d: any) => d.propagationSpeed)
        .ringRepeatPeriod((d: any) => d.repeatPeriod)
        .htmlElementsData(REGIONAL_HUBS)
        .htmlElement((hub: RegionalHub) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'group relative pointer-events-auto cursor-pointer';
          wrapper.style.transform = 'translate(-50%, -50%)';

          const marker = document.createElement('div');
          marker.className = 'flex items-center space-x-1.5 bg-[#080C14]/90 border border-cyan-400 px-2 py-1 rounded-full shadow-[0_0_15px_rgba(56,189,248,0.5)] text-[10px] font-mono font-bold text-cyan-300 hover:scale-110 transition-transform';
          marker.innerHTML = `<span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span><span>${hub.name}</span>`;
          wrapper.appendChild(marker);

          wrapper.onclick = (e) => {
            e.stopPropagation();
            handleHubFlyIn(hub);
          };

          return wrapper;
        });

      // Fallback texture
      const img = new Image();
      img.onerror = () => world.globeImageUrl(fallbackTexture);
      img.src = nasaSatTexture;

      // Controls
      world.pointOfView({ lat: 20.0, lng: 30.0, altitude: 2.2 }, 0);
      world.controls().autoRotate = true;
      world.controls().autoRotateSpeed = 0.35;
      world.controls().enableZoom = true;

      // THREE.JS SCENE: ADD REALISTIC SATELLITES IN 90° ORTHOGONAL ORBITAL PLANES
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

          // Authentic Real Aerospace Materials (Titanium Grey & Space Silver MLI)
          const titaniumGreyBusMat = new THREE.MeshPhongMaterial({ color: 0x64748b, specular: 0xe2e8f0, shininess: 140 });
          const silverMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, specular: 0xffffff, shininess: 180 });
          const chromeTrimMat = new THREE.MeshPhongMaterial({ color: 0xcbd5e1, specular: 0xffffff, shininess: 160 });
          
          // Ultra-glossy Real Mirror Reflective Solar Glass Cells
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

          // Main Spacecraft Bus Chassis (Titanium Grey Aerospace MLI)
          const busGeo = new THREE.BoxGeometry(3.8, 3.8, 5.8);
          const busMesh = new THREE.Mesh(busGeo, titaniumGreyBusMat);
          satGroup.add(busMesh);

          // Space Silver Foil Trim Strips
          const foilStripGeo = new THREE.BoxGeometry(4.0, 0.4, 6.0);
          const foilStrip = new THREE.Mesh(foilStripGeo, chromeTrimMat);
          satGroup.add(foilStrip);

          // Solar Array Wings with Real Specular Mirrors
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

          // VIIRS Optical Sensor Telescope
          const sensorHousingGeo = new THREE.CylinderGeometry(1.6, 1.3, 2.8, 20);
          const sensorHousingMesh = new THREE.Mesh(sensorHousingGeo, titaniumGreyBusMat);
          sensorHousingMesh.position.set(0, 0, 3.8);
          sensorHousingMesh.rotation.x = Math.PI / 2;

          const lensGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.25, 20);
          const lensMesh = new THREE.Mesh(lensGeo, lensMat);
          lensMesh.position.set(0, 1.35, 0);
          sensorHousingMesh.add(lensMesh);
          satGroup.add(sensorHousingMesh);

          // Sensor Infrared Scan Cone Light Beam
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

          // Authentic Communication Satellite Materials
          const whiteBusMat = new THREE.MeshPhongMaterial({ color: 0xf8fafc, specular: 0xffffff, shininess: 150 });
          const chromeDishMat = new THREE.MeshPhongMaterial({ color: 0xe2e8f0, specular: 0xffffff, shininess: 220 });
          const titaniumAccentMat = new THREE.MeshPhongMaterial({ color: 0x64748b, specular: 0xcbd5e1, shininess: 160 });
          const silverStrutMat = new THREE.MeshPhongMaterial({ color: 0xcbd5e1, specular: 0xffffff, shininess: 180 });
          const thrusterMat = new THREE.MeshPhongMaterial({ color: 0x334155, specular: 0x94a3b8, shininess: 120 });

          // Mirror Reflective Sapphire Solar Panels
          const comMirrorSolarMat = new THREE.MeshPhongMaterial({
            color: 0x0284c7,
            specular: 0xffffff,
            shininess: 260,
            reflectivity: 0.95,
          });

          // Main Pristine White/Silver Spacecraft Bus Chassis
          const busGeo = new THREE.BoxGeometry(4.2, 3.4, 6.2);
          const busMesh = new THREE.Mesh(busGeo, whiteBusMat);
          satGroup.add(busMesh);

          // Titanium Skirt Accent Bands
          const skirtGeo = new THREE.BoxGeometry(4.4, 0.45, 6.4);
          const skirtMesh = new THREE.Mesh(skirtGeo, titaniumAccentMat);
          satGroup.add(skirtMesh);

          // Large Deployable Communication Solar Array Wings (Mirror Wings)
          [-1, 1].forEach((dir) => {
            const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 4.5, 12), silverStrutMat);
            strut.rotation.z = Math.PI / 2;
            strut.position.set(dir * 4.2, 0, 0);
            satGroup.add(strut);

            // Triple-Segment Mirror Solar Panels
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

          // PRIMARY COMMUNICATION DISH ANTENNA 1 (Top Reflector Dish on Boom)
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

          // SECONDARY FEEDER LINK DISH ANTENNA 2 (Side Feeder Dish)
          const dishGeo2 = new THREE.SphereGeometry(2.0, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.40);
          const dishMesh2 = new THREE.Mesh(dishGeo2, chromeDishMat);
          dishMesh2.position.set(2.8, 0, 2.0);
          dishMesh2.rotation.y = Math.PI / 3;

          const feedHorn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), titaniumAccentMat);
          feedHorn2.position.set(0, 0.8, 0);
          dishMesh2.add(feedHorn2);
          satGroup.add(dishMesh2);

          // RCS Attitude Control Rocket Nozzles (4 Corners at Base)
          [-1.8, 1.8].forEach((x) => {
            [-2.6, 2.6].forEach((z) => {
              const thruster = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 12), thrusterMat);
              thruster.position.set(x, -2.0, z);
              thruster.rotation.x = Math.PI;
              satGroup.add(thruster);
            });
          });

          // Telemetry RF Scan Light Beam (pointing at Earth center at z = beamDistance)
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
        const trackGeo1 = new THREE.BufferGeometry().setFromPoints(points1.map((p) => new THREE.Vector3(p.x, 0, p.y)));
        const trackMat1 = new THREE.LineDashedMaterial({
          color: 0x38bdf8,
          linewidth: 1,
          scale: 1,
          dashSize: 3,
          gapSize: 3,
          transparent: true,
          opacity: 0.45,
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
        const trackGeo2 = new THREE.BufferGeometry().setFromPoints(points2.map((p) => new THREE.Vector3(p.x, 0, p.y)));
        const trackMat2 = new THREE.LineDashedMaterial({
          color: 0x38bdf8,
          linewidth: 1,
          scale: 1,
          dashSize: 3,
          gapSize: 3,
          transparent: true,
          opacity: 0.45,
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

        // Animation Loop: Opposing Directions & 180° Initial Offset
        let satAngle1 = 0;
        let satAngle2 = Math.PI; // 180° initial offset phase (on opposite sides of Earth!)

        const animatePolarOrbits = () => {
          satAngle1 += 0.0024;  // Orbit 1 rotates Forward
          satAngle2 -= 0.0024;  // Orbit 2 rotates in REVERSE / OPPOSITE direction!

          // Satellite 1 Position (Polar Orbit - N to S)
          const satX1 = Math.cos(satAngle1) * orbitRadius1;
          const satZ1 = Math.sin(satAngle1) * orbitRadius1;
          sat1.satGroup.position.set(satX1, 0, satZ1);
          sat1.satGroup.lookAt(0, 0, 0);
          sat1.beamMat.opacity = 0.20 + Math.sin(satAngle1 * 6) * 0.07;
          sat1.scanFootprintMat.opacity = 0.50 + Math.sin(satAngle1 * 6) * 0.18;

          // Satellite 2 Position (Equatorial Orbit - Counter-Rotating in OPPOSITE Direction)
          const satX2 = Math.cos(satAngle2) * orbitRadius2;
          const satZ2 = Math.sin(satAngle2) * orbitRadius2;
          sat2.satGroup.position.set(satX2, 0, satZ2);
          sat2.satGroup.lookAt(0, 0, 0);
          sat2.beamMat.opacity = 0.20 + Math.cos(satAngle2 * 5) * 0.07;
          sat2.scanFootprintMat.opacity = 0.50 + Math.cos(satAngle2 * 5) * 0.18;

          animFrameId = requestAnimationFrame(animatePolarOrbits);
        };
        animatePolarOrbits();
      }

      globeInstanceRef.current = world;

      const handleResize = () => {
        if (globeInstanceRef.current && globeElRef.current) {
          const w = globeElRef.current.clientWidth || window.innerWidth;
          const h = globeElRef.current.clientHeight || window.innerHeight - 52;
          globeInstanceRef.current.width(w).height(h);
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (animFrameId) cancelAnimationFrame(animFrameId);
        if (globeElRef.current) globeElRef.current.innerHTML = '';
      };
    } catch (e) {
      console.warn('Global Earth Three.js initialization warning:', e);
    }
  }, [filterMode]);

  return (
    <div className="relative w-full h-[calc(100vh-52px)] bg-[#04070D] overflow-hidden font-sans text-slate-100 selection:bg-cyan-500/20 select-none">
      
      {/* 3D THREE.JS CANVAS CONTAINER */}
      <div ref={globeElRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* TOP FLOATING THERMAL FILTER HUD OVERLAY */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 font-mono text-xs">
        <div className="bg-[#080C14]/90 backdrop-blur-md border border-white/15 px-4 py-2 rounded-2xl shadow-2xl flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 text-cyan-400 font-bold text-[11px] uppercase tracking-wider pr-2 border-r border-white/10">
            <Filter className="w-3.5 h-3.5" />
            <span>THERMAL FILTER HUD</span>
          </div>

          <button
            onClick={() => setFilterMode('ALL')}
            className={`px-3 py-1 rounded-full transition flex items-center space-x-1.5 cursor-pointer ${
              filterMode === 'ALL'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_15px_rgba(56,189,248,0.5)]'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>ALL SIGNATURES ({GLOBAL_CLUSTERS.length})</span>
          </button>

          <button
            onClick={() => setFilterMode('INDUSTRIAL')}
            className={`px-3 py-1 rounded-full transition flex items-center space-x-1.5 cursor-pointer ${
              filterMode === 'INDUSTRIAL'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_15px_rgba(56,189,248,0.5)]'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>INDUSTRIAL FLARES</span>
          </button>

          <button
            onClick={() => setFilterMode('WILDLAND')}
            className={`px-3 py-1 rounded-full transition flex items-center space-x-1.5 cursor-pointer ${
              filterMode === 'WILDLAND'
                ? 'bg-orange-500 text-slate-950 font-bold shadow-[0_0_15px_rgba(249,115,22,0.5)]'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>WILDLAND EMERGENCIES</span>
          </button>
        </div>
      </div>

      {/* TOP RIGHT FLOATING SATELLITE ORBIT TELEMETRY CARDS (INTERACTIVE CLICKABLE) */}
      <div className="absolute top-4 right-4 z-30 font-mono text-xs hidden md:block">
        <div className="bg-[#080C14]/90 backdrop-blur-md border border-white/15 rounded-xl p-3 space-y-2 shadow-2xl w-64">
          <div className="flex items-center justify-between text-[11px] text-cyan-400 font-bold border-b border-white/10 pb-1.5">
            <span className="flex items-center space-x-1.5">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>SUN-SYNCHRONOUS ORBITS</span>
            </span>
            <button onClick={handleResetCamera} className="hover:text-white text-slate-400 cursor-pointer" title="Reset Camera">
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* SUOMI-NPP CLICKABLE TELEMETRY CARD */}
          <div
            onClick={() => setSelectedSatellite(SATELLITE_DOSSIERS.SUOMI_NPP)}
            className="p-2.5 rounded-lg bg-black/50 border border-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/10 cursor-pointer transition space-y-1 group"
          >
            <div className="flex justify-between font-bold text-cyan-300 group-hover:text-cyan-200 transition">
              <span>SUOMI-NPP (VIIRS 3.75μm)</span>
              <span className="text-emerald-400 text-[10px]">CLICK FOR DOSSIER &rarr;</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>INCLINATION: <strong>98.7° POLAR</strong></span>
              <span>ALT: <strong>834 km</strong></span>
            </div>
          </div>

          {/* NOAA-20 CLICKABLE TELEMETRY CARD */}
          <div
            onClick={() => setSelectedSatellite(SATELLITE_DOSSIERS.NOAA_20)}
            className="p-2.5 rounded-lg bg-black/50 border border-amber-500/30 hover:border-amber-400 hover:bg-amber-500/10 cursor-pointer transition space-y-1 group"
          >
            <div className="flex justify-between font-bold text-amber-400 group-hover:text-amber-300 transition">
              <span>NOAA-20 (VIIRS M-BAND)</span>
              <span className="text-emerald-400 text-[10px]">CLICK FOR DOSSIER &rarr;</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>INCLINATION: <strong>98.7° POLAR</strong></span>
              <span>ALT: <strong>824 km</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* FLOATING BOTTOM-LEFT REGIONAL HUB SECTOR SELECTOR CARDS */}
      <div className="absolute bottom-4 left-4 z-30 max-w-md w-full font-mono text-xs hidden lg:block">
        <div className="bg-[#080C14]/90 backdrop-blur-md border border-white/15 rounded-xl p-3.5 space-y-2.5 shadow-2xl">
          <div className="flex items-center justify-between text-[11px] text-cyan-400 font-bold uppercase tracking-wider border-b border-white/10 pb-1.5">
            <span className="flex items-center space-x-1.5">
              <Compass className="w-3.5 h-3.5" />
              <span>REGIONAL INDUSTRIAL SECTOR HUBS</span>
            </span>
            <span className="text-slate-400 text-[10px]">CLICK HUB TO FLY-IN</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {REGIONAL_HUBS.map((hub) => (
              <div
                key={hub.id}
                onClick={() => handleHubFlyIn(hub)}
                className="p-2.5 rounded-lg bg-black/50 border border-white/10 hover:border-cyan-400/60 hover:bg-cyan-500/10 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs group-hover:text-cyan-300 transition">{hub.name}</span>
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-125 transition-transform" />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">{hub.country} &bull; {hub.sectorName}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ATMOSPHERIC CAMERA FLY-IN TRANSITION OVERLAY */}
      {isTransitioning && selectedHub && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex flex-col items-center justify-center p-6 text-center space-y-4 font-mono">
          <div className="w-16 h-16 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin flex items-center justify-center shadow-[0_0_30px_#38bdf8]">
            <Globe2 className="w-8 h-8 text-cyan-400 animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="text-xs text-cyan-400 uppercase tracking-widest font-bold">ATMOSPHERIC ENTRY & FLY-IN</div>
            <div className="text-xl font-extrabold text-white uppercase tracking-wide">
              ENTERING SECTOR: {selectedHub.name.toUpperCase()}
            </div>
            <p className="text-xs text-slate-400 font-sans">
              Initializing 2D Operations Room Workstation for coordinates [{selectedHub.lat.toFixed(2)}°N, {selectedHub.lng.toFixed(2)}°E]...
            </p>
          </div>
        </div>
      )}

      {/* SATELLITE DOSSIER TELEMETRY MODAL */}
      <SatelliteDossierModal
        dossier={selectedSatellite}
        onClose={() => setSelectedSatellite(null)}
        onLaunchFirmsAudit={() => navigate('/command-center?view=audit')}
      />

    </div>
  );
};

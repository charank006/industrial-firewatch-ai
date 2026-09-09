import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Globe from 'globe.gl';
import { X, ShieldAlert, BookOpen, ArrowRight } from 'lucide-react';
import { getEarthNightTexture } from '../../utils/earthTexture';
import { classColor } from '../../utils/classColors';
import { useIntelligence } from '../../context/IntelligenceContext';
import { VERDICT_LABEL } from '../../components/intelligence/formatters';
import type { ThermalHotspot } from '../../types';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const globeElRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);

  // Selected Incident State & Ref to prevent useEffect re-triggering
  // `hotspots`, not `filteredHotspots`: the globe is an overview, and
  // silently inheriting the dashboard's 24h/severity filters was the main
  // reason its dot count did not match NASA FIRMS' own map.
  const { hotspots, isLoading, error } = useIntelligence();

  const [selectedIncident, setSelectedIncident] = useState<ThermalHotspot | null>(null);

  // The globe is initialised once, so its marker callback closes over the
  // FIRST render's data - empty, because fires arrive asynchronously. Reading
  // through a ref (and pushing new data in a separate effect) is what stops
  // the globe from staying permanently blank.
  const hotspotsRef = useRef<ThermalHotspot[]>(hotspots);
  hotspotsRef.current = hotspots;

  // Track marker DOM element refs for visual state updates without globe re-renders
  const markerElementsRef = useRef<Map<string, { core: HTMLDivElement; halo: HTMLDivElement }>>(new Map());
  const hasFramedRef = useRef(false);

  // FIRMS plots one dot per satellite pixel; this plots one per clustered
  // event. Showing both numbers is what lets a viewer reconcile the two.
  const pixelCount = hotspots.reduce((total, h) => total + h.detectionCount, 0);

  // Telemetry Clock
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const year = now.getFullYear();
      let hours = now.getHours();
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const formattedHours = String(hours).padStart(2, '0');

      setTimeStr(`${month}/${day}/${year} ${formattedHours}:${minutes}:${seconds} ${ampm}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize Globe.GL Earth ONCE on mount
  useEffect(() => {
    if (!globeElRef.current) return;

    const width = globeElRef.current.clientWidth || window.innerWidth;
    const height = globeElRef.current.clientHeight || window.innerHeight;

    const nasaSatTexture = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
    const fallbackTexture = getEarthNightTexture();

    const world = (Globe as any)()(globeElRef.current)
      .width(width)
      .height(height)
      .globeImageUrl(nasaSatTexture)
      .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
      .backgroundColor('#000000')
      .atmosphereColor('#0088ff')
      .atmosphereAltitude(0.24)
      // Seeded empty and filled by the effect below: fires arrive from the
      // API after this runs.
      .htmlElementsData([] as ThermalHotspot[])
      .htmlElement((d: ThermalHotspot) => {
        const colour = classColor(d.classification);
        const container = document.createElement('div');
        container.className = 'relative flex items-center justify-center cursor-pointer';
        container.style.transform = 'translate(-50%, -50%)';
        container.style.pointerEvents = 'auto';
        container.style.zIndex = '100';

        // Outer glow. Kept deliberately tight and faint: at 20px across 51
        // detections a few kilometres apart, the halos overlapped into a
        // single orange smear and the individual points could not be read.
        const halo = document.createElement('div');
        halo.style.position = 'absolute';
        halo.style.borderRadius = '50%';
        halo.className = 'animate-historical-breath';
        halo.style.width = '8px';
        halo.style.height = '8px';
        halo.style.backgroundColor = `${colour}26`;

        // Inner Marker Core, sized by radiative power.
        const core = document.createElement('div');
        // Smaller than the historical-archive markers this replaced: these
        // are individual detections, often only a few hundred metres apart,
        // and at 7-16px they merged into one blob over the AOI.
        const size = Math.max(3.5, Math.min(8, 3.5 + Math.sqrt(d.frpMw) / 2));
        core.style.borderRadius = '50%';
        core.style.transition = 'all 0.2s ease';
        core.style.width = `${size}px`;
        core.style.height = `${size}px`;
        core.style.backgroundColor = colour;
        core.style.boxShadow = `0 0 3px ${colour}CC`;
        core.style.outline = '0.5px solid rgba(0,0,0,0.55)';
        // A detection we believe is probably not a fire is drawn hollow, so
        // the globe never shows a false alarm as an equal to a real fire.
        if (d.validityVerdict === 'LIKELY_FALSE_ALARM') {
          core.style.backgroundColor = 'transparent';
          core.style.border = `1.5px dashed ${colour}`;
          core.style.boxShadow = 'none';
        }

        container.appendChild(halo);
        container.appendChild(core);

        markerElementsRef.current.set(d.id, { core, halo });

        const tooltip = document.createElement('div');
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '22px';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.pointerEvents = 'none';
        tooltip.style.opacity = '0';
        tooltip.style.visibility = 'hidden';
        tooltip.style.transition = 'opacity 0.2s ease, visibility 0.2s ease';
        tooltip.style.zIndex = '999';
        tooltip.style.width = 'max-content';
        tooltip.style.maxWidth = '220px';
        tooltip.style.backgroundColor = 'rgba(8, 16, 25, 0.96)';
        tooltip.style.border = '1px solid rgba(255, 255, 255, 0.25)';
        tooltip.style.borderRadius = '6px';
        tooltip.style.padding = '8px 10px';
        tooltip.style.fontFamily = 'monospace';
        tooltip.style.fontSize = '10px';
        tooltip.style.color = '#FFFFFF';
        tooltip.style.boxShadow = '0 10px 25px rgba(0,0,0,0.8)';
        tooltip.style.backdropFilter = 'blur(8px)';

        const verdict = d.validityVerdict ? VERDICT_LABEL[d.validityVerdict] : 'NOT ASSESSED';
        tooltip.innerHTML = `
          <div style="font-weight: 700; color: #FFFFFF; font-size: 10.5px; letter-spacing: 0.04em;">${d.id}</div>
          <div style="color: #94A3B8; font-size: 9px; margin-top: 2px;">${d.locationName} &bull; ${d.frpMw} MW</div>
          <div style="color: ${colour}; font-size: 9px; margin-top: 3px;">${d.classification.toUpperCase()}</div>
          <div style="color: #CBD5E1; font-size: 8.5px; margin-top: 1px;">VALIDITY: ${verdict}</div>
        `;
        container.appendChild(tooltip);

        container.addEventListener('mouseenter', () => {
          tooltip.style.opacity = '1';
          tooltip.style.visibility = 'visible';
        });

        container.addEventListener('mouseleave', () => {
          tooltip.style.opacity = '0';
          tooltip.style.visibility = 'hidden';
        });

        const handleClick = (e: MouseEvent | TouchEvent) => {
          e.stopPropagation();
          e.preventDefault();

          if (world.controls()) {
            world.controls().autoRotate = false;
          }

          setSelectedIncident(d);
          world.pointOfView({ lat: d.lat, lng: d.lng, altitude: 0.45 }, 1200);
        };

        container.addEventListener('pointerdown', (e) => e.stopPropagation());
        container.addEventListener('mousedown', (e) => e.stopPropagation());
        container.addEventListener('click', handleClick);

        return container;
      });

    // Fallback texture handling if primary satellite image fails
    const img = new Image();
    img.onerror = () => {
      world.globeImageUrl(fallbackTexture);
    };
    img.src = nasaSatTexture;

    // Camera initial position & rotation setup
    world.pointOfView({ lat: 15.0, lng: 45.0, altitude: 0.8 }, 0);
    const controls = world.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.6;

    // OrbitControls' default near limit stops well short of the surface, so
    // scrolling in could never separate detections a few hundred metres
    // apart. 101 keeps the camera just outside the globe (radius 100).
    controls.minDistance = 101;
    controls.maxDistance = 800;

    // The spin is a nice idle state but fights you the moment you try to look
    // at something, so any interaction ends it.
    const stopSpin = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener('start', stopSpin);
    globeElRef.current.addEventListener('wheel', stopSpin, { passive: true });

    // Custom orbital light tweaking
    const scene = world.scene();
    if (scene) {
      scene.traverse((obj: any) => {
        if (obj.isDirectionalLight) {
          obj.intensity = 2.2;
          obj.color.setHex(0xffffff);
        }
      });
    }

    globeInstanceRef.current = world;

    const handleResize = () => {
      if (globeElRef.current && globeInstanceRef.current) {
        globeInstanceRef.current.width(globeElRef.current.clientWidth);
        globeInstanceRef.current.height(globeElRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      controls.removeEventListener('start', stopSpin);
      window.removeEventListener('resize', handleResize);
      if (globeElRef.current) {
        globeElRef.current.innerHTML = '';
      }
    };
  }, []); // Run ONCE on mount

  // Fires arrive after the globe is built, so the data is pushed here rather
  // than captured in the init effect. Without this the globe stays empty.
  useEffect(() => {
    const world = globeInstanceRef.current;
    if (!world) return;
    markerElementsRef.current.clear();
    world.htmlElementsData(hotspots);

    // Frame the fires the first time a non-empty batch lands, so the AOI is
    // in view instead of the default mid-ocean camera.
    if (hotspots.length > 0 && !hasFramedRef.current) {
      hasFramedRef.current = true;
      const lat = hotspots.reduce((a, h) => a + h.lat, 0) / hotspots.length;
      const lng = hotspots.reduce((a, h) => a + h.lng, 0) / hotspots.length;
      world.pointOfView({ lat, lng, altitude: 1.1 }, 1600);
    }
  }, [hotspots]);

  // Synchronize Marker Visual States when selectedIncident changes
  useEffect(() => {
    markerElementsRef.current.forEach((el, id) => {
      const fire = hotspotsRef.current.find((h) => h.id === id);
      const colour = classColor(fire?.classification ?? 'Unknown Anomaly');
      const isSelected = selectedIncident?.id === id;
      const size = fire ? Math.max(3.5, Math.min(8, 3.5 + Math.sqrt(fire.frpMw) / 2)) : 5;

      if (isSelected) {
        el.core.style.width = `${size + 4}px`;
        el.core.style.height = `${size + 4}px`;
        el.core.style.border = '2px solid #FFFFFF';
        el.core.style.boxShadow = '0 0 14px rgba(255, 255, 255, 0.95)';
        el.halo.style.display = 'none';
      } else {
        el.core.style.width = `${size}px`;
        el.core.style.height = `${size}px`;
        el.core.style.border =
          fire?.validityVerdict === 'LIKELY_FALSE_ALARM' ? `1.5px dashed ${colour}` : 'none';
        el.core.style.boxShadow =
          fire?.validityVerdict === 'LIKELY_FALSE_ALARM' ? 'none' : `0 0 4px ${colour}99`;
        el.halo.style.display = 'block';
      }
    });
  }, [selectedIncident]);

  const handleClosePanel = () => {
    setSelectedIncident(null);
    if (globeInstanceRef.current) {
      globeInstanceRef.current.controls().autoRotate = true;
    }
  };

  return (
    <div className="h-screen w-screen bg-black text-[#F1F4F6] flex flex-col font-mono overflow-hidden relative selection:bg-[#0088ff] selection:text-white">
      {/* 3D WebGL Earth Canvas */}
      <div className="absolute inset-0 z-0 bg-black">
        <div ref={globeElRef} className="w-full h-full" />
      </div>

      {/* Cinematic Edge Vignette Gradient Overlay */}
      <div className="absolute inset-0 pointer-events-none z-10 bg-radial-vignette opacity-80" />

      {/* TOP HEADER: BRANDING ONLY AS "INDUSTRIAL FIREWATCH AI" (NO NASA BRANDING) */}
      <header className="relative z-30 pt-6 px-8 flex items-start justify-between w-full pointer-events-auto">
        {/* TOP LEFT: BRAND TITLE & TELEMETRY */}
        <div className="space-y-1 text-left text-white/80 font-mono tracking-widest text-[11px] uppercase">
          <div className="flex items-center space-x-3 text-white font-bold text-sm">
            <ShieldAlert className="w-4 h-4 text-[#3DB7D9]" />
            <span>INDUSTRIAL FIREWATCH AI</span>
          </div>
          <div className="flex items-center space-x-3 text-white/60 text-[10px]">
            <span>LIVE THERMAL ANOMALY FEED</span>
            <span>&bull;</span>
            <span>TIME: {timeStr}</span>
          </div>
        </div>

        {/* TOP CENTER: BRAND HEADER TEXT */}
        <div className="absolute left-1/2 top-6 -translate-x-1/2 hidden md:flex flex-col items-center">
          <div className="font-mono text-sm font-bold tracking-[0.3em] text-white/90 uppercase select-none">
            GLOBAL THERMAL & HAZARD OBSERVATION
          </div>
        </div>

        {/* TOP RIGHT: NAVIGATION */}
        <div className="flex items-center space-x-6 font-mono text-[11px] tracking-widest text-white/80 uppercase">
          <button
            onClick={() => navigate('/command-center')}
            className="hover:text-white transition flex items-center space-x-1.5 cursor-pointer bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded border border-white/20"
          >
            <span>OPERATIONS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-white/30">/</span>
          <button
            onClick={() => navigate('/mission-brief')}
            className="hover:text-white transition flex items-center space-x-1.5 cursor-pointer"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#3DB7D9]" />
            <span>MISSION BRIEF</span>
          </button>
        </div>
      </header>

      {/* CENTER HUD BRACKET CALLOUT */}
      {!selectedIncident && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="font-mono text-white/60 text-xs tracking-[0.25em] uppercase backdrop-blur-[1px] px-4 py-2 rounded border border-white/10 bg-black/30">
            [ INDUSTRIAL FIREWATCH AI : LIVE THERMAL ANOMALY FEED ]
          </div>
        </div>
      )}

      {/* FIRE INFORMATION PANEL (OPENED ON CLICK) */}
      {selectedIncident && (
        <div className="absolute top-20 right-8 z-40 w-96 max-w-[calc(100vw-2rem)] bg-[#081019]/95 border border-white/20 rounded-xl p-5 backdrop-blur-xl shadow-2xl font-mono text-xs text-white space-y-4 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <span
              className="px-2.5 py-0.5 text-[9.5px] font-bold tracking-widest rounded uppercase border"
              style={{
                color: classColor(selectedIncident.classification),
                borderColor: `${classColor(selectedIncident.classification)}66`,
                backgroundColor: `${classColor(selectedIncident.classification)}22`,
              }}
            >
              {selectedIncident.classification}
            </span>
            <button
              onClick={handleClosePanel}
              className="p-1 rounded-md text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Resume Globe Observation"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <h2 className="text-base font-bold text-white tracking-wide">{selectedIncident.id}</h2>
            <p className="text-[11px] text-white/60 font-mono mt-0.5">
              {selectedIncident.locationName} &bull; {selectedIncident.timeFormatted}
            </p>
          </div>

          {/* Validity before class, the same order the detail page uses. */}
          <div className="space-y-3 text-[11px] bg-white/5 p-3.5 rounded-lg border border-white/10">
            <div>
              <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">
                Is this a real fire?
              </span>
              <span className="text-white font-medium">
                {selectedIncident.validityVerdict
                  ? `${VERDICT_LABEL[selectedIncident.validityVerdict]} — ${selectedIncident.validityConfidencePct}% likely genuine`
                  : 'Not yet assessed'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">
                  Radiative Power
                </span>
                <span className="text-white font-medium">{selectedIncident.frpMw} MW</span>
              </div>
              <div>
                <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">
                  Severity
                </span>
                <span className="text-white font-medium">{selectedIncident.severity}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">
                  Pass
                </span>
                <span className="text-white font-medium">
                  {selectedIncident.dayNight === 'N' ? 'Night' : 'Day'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">
                  Position
                </span>
                <span className="text-white font-medium">
                  {selectedIncident.lat.toFixed(3)}, {selectedIncident.lng.toFixed(3)}
                </span>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-white/40 font-mono pt-1">
            SOURCE: NASA FIRMS &bull; thermal anomaly, not a confirmed fire
          </div>

          <button
            onClick={() => navigate(`/fire/${selectedIncident.id}`)}
            className="w-full py-2 rounded-lg bg-[#3DB7D9] hover:bg-[#54C8E6] text-[#05080D] font-bold tracking-wider text-[11px] transition flex items-center justify-center space-x-1.5"
          >
            <span>FULL ANALYSIS</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* BOTTOM FOOTER */}
      <footer className="mt-auto relative z-30 pb-6 px-8 flex items-center justify-between w-full pointer-events-none font-mono text-[10px] text-white/60 tracking-widest uppercase">
        <div className="flex items-center space-x-6">
          <span>
            {isLoading
              ? 'LOADING LIVE DETECTIONS...'
              : error
                ? `FEED ERROR: ${error}`
                : `${hotspots.length} EVENTS FROM ${pixelCount} SATELLITE DETECTIONS`}
          </span>
          <span>&bull;</span>
          <span>NASA FIRMS &bull; VIIRS / MODIS</span>
        </div>

        <div className="flex items-center space-x-2">
          <span>INDUSTRIAL FIREWATCH AI</span>
          <span>:ONLINE</span>
        </div>
      </footer>
    </div>
  );
};

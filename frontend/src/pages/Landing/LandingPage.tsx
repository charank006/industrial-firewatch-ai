import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Globe from 'globe.gl';
import { X, ShieldAlert, BookOpen, ArrowRight } from 'lucide-react';
import { HISTORICAL_EVENTS } from '../../data/historicalEvents';
import type { HistoricalEvent } from '../../types/historicalEvents';
import { getEarthNightTexture } from '../../utils/earthTexture';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const globeElRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);

  // Selected Incident State & Ref to prevent useEffect re-triggering
  const [selectedIncident, setSelectedIncident] = useState<HistoricalEvent | null>(null);
  const selectedIncidentRef = useRef<HistoricalEvent | null>(null);
  selectedIncidentRef.current = selectedIncident;

  // Track marker DOM element refs for visual state updates without globe re-renders
  const markerElementsRef = useRef<Map<string, { core: HTMLDivElement; halo: HTMLDivElement }>>(new Map());

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
      .htmlElementsData(HISTORICAL_EVENTS)
      .htmlElement((d: HistoricalEvent) => {
        const container = document.createElement('div');
        container.className = 'relative flex items-center justify-center cursor-pointer';
        container.style.transform = 'translate(-50%, -50%)';
        container.style.pointerEvents = 'auto';
        container.style.zIndex = '100';

        // Outer Glow / Breathing Animation Layer
        const halo = document.createElement('div');
        halo.style.position = 'absolute';
        halo.style.borderRadius = '50%';
        halo.className = 'animate-historical-breath';
        halo.style.width = '20px';
        halo.style.height = '20px';
        halo.style.backgroundColor = 'rgba(245, 158, 11, 0.25)';

        // Inner Marker Core
        const core = document.createElement('div');
        core.style.borderRadius = '50%';
        core.style.transition = 'all 0.2s ease';
        core.style.width = '9px';
        core.style.height = '9px';
        core.style.backgroundColor = '#F59E0B';
        core.style.boxShadow = '0 0 6px rgba(245, 158, 11, 0.6)';

        container.appendChild(halo);
        container.appendChild(core);

        // Store reference for quick highlight updates
        markerElementsRef.current.set(d.id, { core, halo });

        // Hover Tooltip (Concise 2-line dark tooltip <230px)
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

        tooltip.innerHTML = `
          <div style="font-weight: 700; color: #FFFFFF; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em;">${d.name}</div>
          <div style="color: #94A3B8; font-size: 9px; margin-top: 2px;">${d.date} &bull; ${d.country.toUpperCase()}</div>
          <div style="color: #CBD5E1; font-size: 8.5px; margin-top: 3px; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${d.shortSummary}</div>
        `;
        container.appendChild(tooltip);

        // Bulletproof Hover Event Handlers
        container.addEventListener('mouseenter', () => {
          tooltip.style.opacity = '1';
          tooltip.style.visibility = 'visible';
        });

        container.addEventListener('mouseleave', () => {
          tooltip.style.opacity = '0';
          tooltip.style.visibility = 'hidden';
        });

        // Bulletproof Pointer & Click Handlers (Stop Propagation for Three.js OrbitControls)
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
    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.35;
    world.controls().enableZoom = true;

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
      window.removeEventListener('resize', handleResize);
      if (globeElRef.current) {
        globeElRef.current.innerHTML = '';
      }
    };
  }, []); // Run ONCE on mount

  // Synchronize Marker Visual States when selectedIncident changes
  useEffect(() => {
    markerElementsRef.current.forEach((el, id) => {
      const isSelected = selectedIncident?.id === id;
      if (isSelected) {
        el.core.style.width = '14px';
        el.core.style.height = '14px';
        el.core.style.backgroundColor = '#F59E0B';
        el.core.style.border = '2px solid #FFFFFF';
        el.core.style.boxShadow = '0 0 14px rgba(255, 255, 255, 0.95)';
        el.halo.style.display = 'none';
      } else {
        el.core.style.width = '9px';
        el.core.style.height = '9px';
        el.core.style.backgroundColor = '#F59E0B';
        el.core.style.border = 'none';
        el.core.style.boxShadow = '0 0 6px rgba(245, 158, 11, 0.6)';
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
            <span>HISTORICAL INCIDENT ARCHIVE</span>
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
            [ INDUSTRIAL FIREWATCH AI : HISTORICAL DISASTER ARCHIVE ]
          </div>
        </div>
      )}

      {/* INCIDENT INFORMATION PANEL (OPENED ON CLICK) */}
      {selectedIncident && (
        <div className="absolute top-20 right-8 z-40 w-96 max-w-[calc(100vw-2rem)] bg-[#081019]/95 border border-white/20 rounded-xl p-5 backdrop-blur-xl shadow-2xl font-mono text-xs text-white space-y-4 pointer-events-auto">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <span className="px-2.5 py-0.5 text-[9.5px] font-bold tracking-widest rounded bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40 uppercase">
              {selectedIncident.markerType === 'historical' ? 'HISTORICAL EVENT' : 'INCIDENT RECORD'}
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
            <h2 className="text-base font-bold text-white tracking-wide font-sans">{selectedIncident.name}</h2>
            <p className="text-[11px] text-white/60 font-mono mt-0.5">
              {selectedIncident.cityRegion}, {selectedIncident.country} &bull; {selectedIncident.date}
            </p>
          </div>

          <div className="space-y-3 text-[11px] bg-white/5 p-3.5 rounded-lg border border-white/10 font-sans">
            <div>
              <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">EVENT TYPE</span>
              <span className="text-white font-medium">{selectedIncident.eventType}</span>
            </div>

            <div>
              <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">WHAT HAPPENED</span>
              <p className="text-white/90 leading-relaxed text-xs">{selectedIncident.details || selectedIncident.shortSummary}</p>
            </div>

            <div>
              <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">IMPACT</span>
              <p className="text-white/80 leading-relaxed text-xs">{selectedIncident.impact}</p>
            </div>

            <div className="flex justify-between items-center pt-1 text-[10.5px]">
              <div>
                <span className="text-white/50 font-mono uppercase">STATUS: </span>
                <span className="text-white font-medium font-mono">{selectedIncident.status}</span>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-white/40 flex items-center justify-between font-mono pt-1">
            <span>SOURCE: {selectedIncident.source}</span>
          </div>

          <button
            onClick={handleClosePanel}
            className="w-full py-2.5 px-3 bg-white/10 hover:bg-white/20 text-white font-mono text-[11px] tracking-wider uppercase rounded transition border border-white/20 cursor-pointer"
          >
            RESUME GLOBE OBSERVATION
          </button>
        </div>
      )}

      {/* BOTTOM FOOTER */}
      <footer className="mt-auto relative z-30 pb-6 px-8 flex items-center justify-between w-full pointer-events-none font-mono text-[10px] text-white/60 tracking-widest uppercase">
        <div className="flex items-center space-x-6">
          <span>HISTORICAL DISASTERS: {HISTORICAL_EVENTS.length} ARCHIVED RECORDS</span>
          <span>&bull;</span>
          <span>GLOBAL DISTRIBUTION: ACTIVE</span>
        </div>

        <div className="flex items-center space-x-2">
          <span>INDUSTRIAL FIREWATCH AI</span>
          <span>:ONLINE</span>
        </div>
      </footer>
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Globe from 'globe.gl';
import { 
  Globe2, 
  Flame, 
  ShieldAlert, 
  Radar, 
  Building2, 
  Activity, 
  CheckCircle2, 
  Radio, 
  Layers, 
  Compass, 
  ExternalLink, 
  Zap, 
  Filter, 
  Clock, 
  Crosshair, 
  AlertTriangle, 
  ChevronRight,
  Sparkles,
  Search,
  X
} from 'lucide-react';

import { getEarthNightTexture } from '../../utils/earthTexture';
import { HISTORICAL_EVENTS } from '../../data/historicalEvents';
import { LANDING_SIGNALS, type LandingSignal } from '../../data/landingSignals';
import { MOCK_FACILITIES } from '../../data/mockFacilities';

export default function GeoFlareLanding() {
  const navigate = useNavigate();
  const globeElRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);

  // States
  const [selectedSignal, setSelectedSignal] = useState<LandingSignal>(LANDING_SIGNALS[0]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CRITICAL' | 'ROUTINE' | 'NEW'>('ALL');
  const [inspectedIncident, setInspectedIncident] = useState<LandingSignal | null>(null);
  const [utcTime, setUtcTime] = useState<string>('');
  const [isGlobeRotating, setIsGlobeRotating] = useState<boolean>(true);

  // Live UTC Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().replace('T', ' // ').substring(0, 22) + ' UTC');
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize 3D WebGL Globe with Three.js / globe.gl
  useEffect(() => {
    if (!globeElRef.current) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nasaSatTexture = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
    const fallbackTexture = getEarthNightTexture();

    // Map historical events and active landing signals to globe HTML elements
    const globePoints = [
      ...HISTORICAL_EVENTS.slice(0, 12).map((ev) => ({
        lat: ev.latitude,
        lng: ev.longitude,
        name: ev.title,
        color: ev.severity === 'CRITICAL' ? '#EF4444' : '#F97316',
        frp: `${ev.frpMw} MW`,
        type: 'HISTORICAL'
      })),
      ...LANDING_SIGNALS.map((sig) => ({
        lat: sig.lat,
        lng: sig.lng,
        name: sig.locationName,
        color: sig.severity === 'CRITICAL' ? '#EF4444' : sig.severity === 'HIGH' ? '#F97316' : '#38BDF8',
        frp: `${sig.frpMw} MW`,
        type: 'ACTIVE'
      }))
    ];

    try {
      const container = globeElRef.current;
      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || 540;

      const world = (Globe as any)()(container)
        .width(width)
        .height(height)
        .globeImageUrl(nasaSatTexture)
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundColor('rgba(0,0,0,0)')
        .atmosphereColor('#38bdf8')
        .atmosphereAltitude(0.22)
        .htmlElementsData(globePoints)
        .htmlElement((d: any) => {
          const wrapper = document.createElement('div');
          wrapper.className = 'group relative pointer-events-auto cursor-pointer';
          wrapper.style.transform = 'translate(-50%, -50%)';

          const beacon = document.createElement('div');
          beacon.style.width = d.type === 'ACTIVE' ? '10px' : '8px';
          beacon.style.height = d.type === 'ACTIVE' ? '10px' : '8px';
          beacon.style.borderRadius = '50%';
          beacon.style.backgroundColor = d.color;
          beacon.style.boxShadow = `0 0 12px ${d.color}`;
          wrapper.appendChild(beacon);

          if (!prefersReducedMotion) {
            const ring = document.createElement('div');
            ring.style.position = 'absolute';
            ring.style.top = '50%';
            ring.style.left = '50%';
            ring.style.transform = 'translate(-50%, -50%)';
            ring.style.width = '20px';
            ring.style.height = '20px';
            ring.style.borderRadius = '50%';
            ring.style.border = `1.5px solid ${d.color}`;
            ring.className = 'animate-ping opacity-75';
            wrapper.appendChild(ring);
          }

          // Tooltip Label
          const tooltip = document.createElement('div');
          tooltip.className = 'hidden group-hover:block absolute left-4 top-1/2 -translate-y-1/2 bg-[#040812]/95 border border-cyan-500/40 text-[10px] font-mono text-white px-2.5 py-1.5 rounded shadow-xl whitespace-nowrap z-50';
          tooltip.innerHTML = `<span style="color: ${d.color}; font-weight: bold;">●</span> ${d.name} <span class="text-slate-400">(${d.frp})</span>`;
          wrapper.appendChild(tooltip);

          return wrapper;
        });

      // Handle texture fallback if external image fails
      const img = new Image();
      img.onerror = () => world.globeImageUrl(fallbackTexture);
      img.src = nasaSatTexture;

      world.pointOfView({ lat: 21.17, lng: 72.83, altitude: 2.1 }, 0);

      if (!prefersReducedMotion) {
        world.controls().autoRotate = true;
        world.controls().autoRotateSpeed = 0.6;
      }
      world.controls().enableZoom = true;

      // Rotate behavior
      const controls = world.controls();
      controls.addEventListener('start', () => {
        controls.autoRotate = false;
        setIsGlobeRotating(false);
      });

      globeInstanceRef.current = world;

      const handleResize = () => {
        if (globeInstanceRef.current && globeElRef.current) {
          const w = globeElRef.current.clientWidth || window.innerWidth;
          const h = globeElRef.current.clientHeight || 540;
          globeInstanceRef.current.width(w).height(h);
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (globeElRef.current) globeElRef.current.innerHTML = '';
      };
    } catch (e) {
      console.warn('3D Globe initialization error, fallback texture active', e);
    }
  }, []);

  const toggleAutoRotate = () => {
    if (globeInstanceRef.current) {
      const nextState = !isGlobeRotating;
      globeInstanceRef.current.controls().autoRotate = nextState;
      setIsGlobeRotating(nextState);
    }
  };

  // Filtered live feed incidents
  const filteredIncidents = LANDING_SIGNALS.filter((sig) => {
    if (activeFilter === 'CRITICAL') return sig.severity === 'CRITICAL' || sig.severity === 'HIGH';
    if (activeFilter === 'ROUTINE') return sig.severity === 'MEDIUM' || sig.severity === 'LOW';
    if (activeFilter === 'NEW') return sig.isNew;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#04070D] text-slate-100 font-sans selection:bg-cyan-500/30 overflow-x-hidden antialiased">
      
      {/* HUD Background Grid Texture */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-15 z-0"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(56, 189, 248, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(56, 189, 248, 0.08) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px'
        }}
      />

      {/* TOP NAVIGATION BAR */}
      <header className="sticky top-0 z-50 border-b border-cyan-500/20 bg-[#04070D]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping absolute" />
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 relative" />
            </div>
            <span className="font-mono text-sm font-bold tracking-widest text-white uppercase">
              GEOFLARE <span className="text-cyan-400">//</span> INTELLIGENCE
            </span>
            <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950/60 border border-cyan-500/30 text-cyan-400">
              <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
              ORBITAL SENSOR FEED ACTIVE
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-6 font-mono text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              SYS_TIME: {utcTime}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/mission-brief')}
              className="text-xs font-mono text-slate-400 hover:text-white uppercase transition-colors px-3 py-2 hidden sm:inline-block cursor-pointer"
            >
              Mission Brief
            </button>
            <button
              onClick={() => navigate('/command-center')}
              className="px-4 py-2 text-xs font-mono font-bold tracking-wider uppercase bg-cyan-500 hover:bg-cyan-400 text-black rounded transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center gap-2 cursor-pointer"
            >
              <span>Enter Operations</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* HERO SECTION: THREE.JS 3D WEBGL GLOBE + VALUE PROP */}
      <section className="relative min-h-[calc(100vh-4rem)] flex items-center border-b border-white/10 px-6 py-10 z-10">
        <div className="max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          
          {/* Left Column: Narrative & Clear Positioning */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/30 bg-cyan-950/40 text-cyan-300 text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>GLOBAL THERMAL RECOGNITION PLATFORM</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-none">
              RAW HEAT IS NOISE. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-200 to-amber-300">
                WE CLASSIFY THE SIGNAL.
              </span>
            </h1>

            <p className="text-slate-300 text-base sm:text-lg font-normal leading-relaxed max-w-xl">
              Standard LEO satellite sensors register thousands of high-temperature false alarms every hour. 
              <br /><br />
              <strong className="text-white">GeoFlare applies sub-kilometer spatial GIS boundaries and 180-day persistence logs</strong> to separate routine refinery flares from uncontained wildfires in sub-seconds.
            </p>

            <div className="flex flex-wrap gap-4 pt-2">
              <a
                href="#classifier"
                className="px-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs tracking-wider uppercase rounded transition-all shadow-[0_0_25px_rgba(6,182,212,0.35)] flex items-center gap-2"
              >
                <span>Launch Anomaly Classifier</span>
                <span>↓</span>
              </a>
              <a
                href="#surveillance-feed"
                className="px-6 py-3.5 border border-white/20 hover:border-cyan-400 text-slate-300 font-mono text-xs tracking-wider uppercase rounded transition-all hover:bg-white/5 flex items-center gap-2"
              >
                <Activity className="w-4 h-4 text-cyan-400" />
                <span>Live Feed</span>
              </a>
            </div>

            {/* Proof Metrics */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/10 max-w-lg font-mono">
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-cyan-400">&lt; 3.2s</div>
                <div className="text-[11px] text-slate-400 uppercase mt-0.5">Alert Latency</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-white">99.4%</div>
                <div className="text-[11px] text-slate-400 uppercase mt-0.5">Flare Filter Rate</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-bold text-emerald-400">Zero</div>
                <div className="text-[11px] text-slate-400 uppercase mt-0.5">Field Hardware</div>
              </div>
            </div>
          </div>

          {/* Right Column: Authentic Interactive 3D WebGL Globe */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center relative">
            <div className="relative w-full h-[480px] sm:h-[540px] rounded-2xl border border-cyan-500/20 bg-[#040814]/80 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-sm">
              
              {/* Three.js Globe Container */}
              <div ref={globeElRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

              {/* HUD Reticle Overlays */}
              <div className="absolute top-4 left-4 font-mono text-[10px] text-cyan-400/90 bg-[#04070D]/80 px-3 py-1.5 rounded border border-cyan-500/30 backdrop-blur-md flex items-center gap-2">
                <Globe2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                <span>3D WEBGL SATELLITE GLOBE (NOAA-20 / VIIRS)</span>
              </div>

              <div className="absolute top-4 right-4 flex items-center gap-2">
                <button
                  onClick={toggleAutoRotate}
                  className="px-2.5 py-1 font-mono text-[10px] bg-[#04070D]/80 hover:bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 rounded backdrop-blur-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Compass className={`w-3 h-3 ${isGlobeRotating ? 'animate-spin' : ''}`} />
                  <span>{isGlobeRotating ? 'ROTATION: ON' : 'ROTATION: PAUSED'}</span>
                </button>
              </div>

              <div className="absolute bottom-4 left-4 font-mono text-[10px] text-slate-400 bg-[#04070D]/80 px-3 py-1.5 rounded border border-white/10">
                ACTIVE INCIDENT BEACONS: <span className="text-cyan-400 font-bold">{LANDING_SIGNALS.length + HISTORICAL_EVENTS.slice(0, 12).length} SITES</span>
              </div>

              <div className="absolute bottom-4 right-4 font-mono text-[10px] text-slate-400 bg-[#04070D]/80 px-3 py-1.5 rounded border border-white/10 text-right">
                RES: 375M I-BAND // SPECTRAL: 3.74µm - 11.45µm
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* SECTION 2: MULTI-SPECTRAL ANOMALY CLASSIFIER */}
      <section id="classifier" className="py-24 border-b border-white/10 px-6 bg-[#060910] z-10 relative">
        <div className="max-w-7xl mx-auto space-y-10">
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-cyan-400 font-semibold flex items-center gap-2">
                <Layers className="w-3.5 h-3.5" />
                [ MULTI-SPECTRAL ANOMALY DISCRIMINATOR ]
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mt-1">
                ONE THERMAL SPIKE. FIVE DISTINCT SIGNATURES.
              </h2>
            </div>
            <p className="font-mono text-xs text-slate-400 max-w-md">
              Select a signal below to see how GeoFlare synthesizes spatial GIS boundaries, infrared radiative power (FRP), and 180-day persistence archives.
            </p>
          </div>

          {/* Classifier Console Box */}
          <div className="grid grid-cols-1 lg:grid-cols-12 rounded-xl border border-cyan-500/30 bg-[#070D18] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.7)]">
            
            {/* Left Selection List */}
            <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-white/10 divide-y divide-white/5">
              {LANDING_SIGNALS.map((sig) => {
                const isSelected = selectedSignal.id === sig.id;
                const statusColor = 
                  sig.severity === 'CRITICAL' ? '#ef4444' : 
                  sig.severity === 'HIGH' ? '#f97316' : 
                  sig.severity === 'MEDIUM' ? '#f59e0b' : '#10b981';

                return (
                  <button
                    key={sig.id}
                    onClick={() => setSelectedSignal(sig)}
                    className={`w-full text-left p-5 transition-all relative flex flex-col gap-2 cursor-pointer ${
                      isSelected ? 'bg-cyan-950/40 text-white' : 'hover:bg-white/[0.02] text-slate-400'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan-400 shadow-[0_0_12px_#38bdf8]" />
                    )}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-white flex items-center gap-2">
                        <Flame className="w-3.5 h-3.5" style={{ color: statusColor }} />
                        {sig.classification}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold"
                        style={{
                          backgroundColor: `${statusColor}20`,
                          color: statusColor,
                          border: `1px solid ${statusColor}40`,
                        }}
                      >
                        {sig.severity}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                      <span>{sig.locationName}</span>
                      <span className="text-cyan-400 font-bold">{sig.frpMw} MW</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Telemetry & Reasoning Inspector */}
            <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between bg-gradient-to-br from-[#060B14] to-[#04070D]">
              
              {/* Telemetry Header Bar */}
              <div className="flex flex-wrap items-center justify-between border-b border-white/10 pb-4 gap-2 font-mono text-xs">
                <div>
                  <span className="text-slate-500">SIGNAL ID:</span>{' '}
                  <span className="text-white font-bold">{selectedSignal.id}</span>
                </div>
                <div>
                  <span className="text-slate-500">COORDINATES:</span>{' '}
                  <span className="text-cyan-400 font-bold">{selectedSignal.lat.toFixed(4)}°, {selectedSignal.lng.toFixed(4)}°</span>
                </div>
                <div>
                  <span className="text-slate-500">CONFIDENCE:</span>{' '}
                  <span className="text-emerald-400 font-bold">{selectedSignal.confidence}%</span>
                </div>
              </div>

              {/* FLIR Visualizer Box */}
              <div className="my-6 relative h-60 w-full rounded-lg border border-white/10 bg-black/80 overflow-hidden flex items-center justify-center">
                <div 
                  className="w-44 h-44 rounded-full transition-all duration-700 blur-2xl opacity-70 animate-pulse"
                  style={{
                    backgroundColor: 
                      selectedSignal.severity === 'CRITICAL' ? '#ef4444' : 
                      selectedSignal.severity === 'HIGH' ? '#f97316' : '#38bdf8'
                  }}
                />
                <div className="absolute w-6 h-6 rounded-full bg-white shadow-[0_0_20px_#ffffff]" />

                {/* HUD Crosshairs */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                  <div className="w-32 h-32 border border-dashed border-cyan-400 rounded-full animate-spin-slow" />
                  <div className="absolute w-44 h-[1px] bg-cyan-400" />
                  <div className="absolute h-44 w-[1px] bg-cyan-400" />
                </div>

                <div className="absolute bottom-3 left-3 bg-black/80 px-2.5 py-1 rounded border border-white/10 font-mono text-[11px] text-slate-300">
                  RADIATIVE POWER: <span className="text-white font-bold">{selectedSignal.frpMw} MW</span>
                </div>
                <div className="absolute bottom-3 right-3 bg-black/80 px-2.5 py-1 rounded border border-white/10 font-mono text-[11px] text-slate-300">
                  BRIGHTNESS TEMP: <span className="text-amber-400 font-bold">{selectedSignal.brightnessK} K</span>
                </div>
              </div>

              {/* Reasoning Steps Audit */}
              <div className="space-y-3 font-mono">
                <div className="text-[11px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  CLASSIFIER REASONING AUDIT LOG:
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {selectedSignal.reasoningSteps.map((step) => (
                    <div key={step.stepIndex} className="p-2.5 rounded bg-white/[0.03] border border-white/10">
                      <div className="text-[10px] text-slate-400 font-bold mb-0.5">
                        STEP 0{step.stepIndex} // {step.label.toUpperCase()}
                      </div>
                      <div className="text-slate-200 text-[11px] leading-tight">{step.detail}</div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded text-xs text-cyan-300 mt-2">
                  <strong className="text-cyan-400">RECOMMENDED ACTION:</strong> {selectedSignal.suggestedAction}
                </div>
              </div>

            </div>

          </div>
        </div>
      </section>

      {/* SECTION 3: 4-STEP OPERATIONAL PIPELINE */}
      <section className="py-20 border-b border-white/10 px-6 bg-[#03060B] z-10 relative">
        <div className="max-w-7xl mx-auto space-y-12">
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-cyan-400 font-semibold flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" />
              [ THE ARCHITECTURE ]
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
              4-STAGE AUTONOMOUS DETECTION PIPELINE
            </h2>
            <p className="text-slate-400 text-sm max-w-2xl mt-1 font-mono">
              From low-earth orbit infrared packet downlink to verified industrial SCADA dispatch in under 30 seconds.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative font-mono">
            {[
              {
                step: '01',
                title: 'Satellite Downlink',
                desc: 'Raw thermal packets ingested directly from NOAA-20 VIIRS (3.74µm I-Band) and Sentinel-3 SLSTR channels.'
              },
              {
                step: '02',
                title: 'Spatial Boundary GIS',
                desc: 'Coordinates cross-referenced against refinery fences, chemical SEZs, and industrial facility registries.'
              },
              {
                step: '03',
                title: '180-Day History Audit',
                desc: 'AI checks historical persistence: 6-month continuous flare stack vs new uncontained spatial firestorm.'
              },
              {
                step: '04',
                title: 'Automated Dispatch',
                desc: 'Routine flares silenced automatically; uncontained fires trigger Webhooks & SMS to safety officers.'
              },
            ].map((st, i) => (
              <div
                key={st.step}
                className="p-6 rounded-lg border border-white/10 bg-[#070D18] flex flex-col justify-between hover:border-cyan-500/40 transition-colors"
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-cyan-400 text-xs font-bold">STAGE {st.step}</span>
                    {i < 3 && <ChevronRight className="hidden md:block w-4 h-4 text-slate-600" />}
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2">{st.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">{st.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: REAL-TIME ACTIVE SURVEILLANCE FEED */}
      <section id="surveillance-feed" className="py-24 px-6 border-b border-white/10 bg-[#04070D] z-10 relative">
        <div className="max-w-7xl mx-auto space-y-8">
          
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="font-mono text-xs uppercase tracking-widest text-cyan-400 font-semibold flex items-center gap-2">
                <Radar className="w-3.5 h-3.5 animate-spin-slow" />
                [ LIVE SURVEILLANCE TELEMETRY FEED ]
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                ACTIVE SATELLITE DISPATCH STREAM
              </h2>
            </div>
            
            {/* Filter Buttons */}
            <div className="flex items-center gap-2 font-mono text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              {(['ALL', 'CRITICAL', 'ROUTINE', 'NEW'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-3 py-1 rounded transition-colors cursor-pointer ${
                    activeFilter === filter
                      ? 'bg-cyan-500 text-black font-bold'
                      : 'bg-white/5 text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Telemetry Table */}
          <div className="rounded-xl border border-white/10 overflow-hidden bg-[#060A13]">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-white/10 bg-white/[0.02] text-slate-400">
                <tr>
                  <th className="p-4">INCIDENT ID</th>
                  <th className="p-4">LOCATION / FACILITY</th>
                  <th className="p-4">SENSOR</th>
                  <th className="p-4">RADIATIVE POWER</th>
                  <th className="p-4">CLASSIFICATION</th>
                  <th className="p-4">CONFIDENCE</th>
                  <th className="p-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredIncidents.map((inc) => {
                  const isCritical = inc.severity === 'CRITICAL' || inc.severity === 'HIGH';
                  return (
                    <tr key={inc.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="p-4 font-bold text-cyan-400 flex items-center gap-2">
                        {isCritical ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                        {inc.id}
                      </td>
                      <td className="p-4 font-sans font-medium text-white">
                        {inc.locationName}
                      </td>
                      <td className="p-4 text-slate-400">NOAA-20 / VIIRS</td>
                      <td className="p-4 text-amber-400 font-bold">{inc.frpMw} MW</td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                            isCritical
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          }`}
                        >
                          {inc.classification}
                        </span>
                      </td>
                      <td className="p-4 text-emerald-400">{inc.confidence}%</td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => setInspectedIncident(inc)}
                          className="px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <span>Inspect</span>
                          <Search className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pt-2 flex justify-center">
            <button
              onClick={() => navigate('/command-center')}
              className="py-3 px-8 bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs tracking-wider uppercase rounded transition-all shadow-[0_0_20px_rgba(6,182,212,0.3)] flex items-center gap-2 cursor-pointer"
            >
              <span>View All Operational Incidents</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

        </div>
      </section>

      {/* INSPECTION MODAL */}
      {inspectedIncident && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-2xl w-full bg-[#070D18] border border-cyan-500/40 rounded-xl p-6 space-y-6 font-mono relative shadow-2xl">
            <button 
              onClick={() => setInspectedIncident(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <ShieldAlert className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-lg font-bold text-white">{inspectedIncident.classification} // {inspectedIncident.id}</h3>
                <p className="text-xs text-slate-400 font-sans">{inspectedIncident.locationName}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-white/[0.02] border border-white/10 rounded">
                <span className="text-slate-500">COORDINATES:</span>
                <div className="text-white font-bold mt-1">{inspectedIncident.lat.toFixed(4)}° N, {inspectedIncident.lng.toFixed(4)}° E</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/10 rounded">
                <span className="text-slate-500">RADIATIVE POWER:</span>
                <div className="text-amber-400 font-bold mt-1">{inspectedIncident.frpMw} MW (Temp: {inspectedIncident.brightnessK} K)</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/10 rounded">
                <span className="text-slate-500">NEAREST ASSET:</span>
                <div className="text-white font-bold mt-1">{inspectedIncident.nearestFacilityName} ({inspectedIncident.facilityDistanceKm} km)</div>
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/10 rounded">
                <span className="text-slate-500">CONFIDENCE RATING:</span>
                <div className="text-emerald-400 font-bold mt-1">{inspectedIncident.confidence}% Match</div>
              </div>
            </div>

            <div className="p-4 bg-cyan-950/40 border border-cyan-500/30 rounded text-xs text-cyan-200 leading-relaxed font-sans">
              <strong className="text-cyan-400 font-mono">ACTION PROTOCOL:</strong> {inspectedIncident.suggestedAction}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setInspectedIncident(null)}
                className="px-4 py-2 text-xs border border-white/20 text-slate-300 rounded hover:bg-white/5 cursor-pointer"
              >
                Close Window
              </button>
              <button
                onClick={() => navigate('/command-center')}
                className="px-4 py-2 text-xs bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded cursor-pointer"
              >
                Open in Command Center →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FINAL CALL TO ACTION */}
      <section className="py-24 px-6 text-center bg-gradient-to-t from-cyan-950/40 via-transparent to-transparent z-10 relative">
        <div className="max-w-3xl mx-auto space-y-6">
          <span className="font-mono text-xs uppercase tracking-widest text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded bg-cyan-950/60">
            OPERATIONAL READINESS
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Stop Chasing False Alarms.
          </h2>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Equip your emergency operations and plant safety control rooms with automated, global thermal recognition. Integrates into existing SCADA & dispatch systems in minutes.
          </p>
          <div className="pt-4 flex justify-center gap-4">
            <button
              onClick={() => navigate('/command-center')}
              className="px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-sm tracking-wider uppercase rounded transition-all shadow-[0_0_30px_rgba(6,182,212,0.4)] flex items-center gap-2 cursor-pointer"
            >
              <span>Launch Command Center</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto border-t border-white/10 mt-20 pt-8 flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-slate-500 gap-4">
          <div>GEOFLARE AI // AUTONOMOUS ORBITAL SURVEILLANCE PLATFORM</div>
          <div>NOAA-20 VIIRS · MODIS · SENTINEL-3 SLSTR COMPLIANT</div>
        </div>
      </section>

    </div>
  );
}

export const LandingPage = GeoFlareLanding;

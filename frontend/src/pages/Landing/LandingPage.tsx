import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Globe from 'globe.gl';
import {
  ArrowRight,
  BookOpen,
  Compass,
  Radar,
} from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { getEarthNightTexture } from '../../utils/earthTexture';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { filteredHotspots, facilities, selectIncidentById } = useIntelligence();
  const globeElRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);
  const [showRegionalBtn, setShowRegionalBtn] = useState<boolean>(false);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);

  // Initialize Globe.GL 3D Earth
  useEffect(() => {
    if (!globeElRef.current) return;

    const width = globeElRef.current.clientWidth || window.innerWidth;
    const height = globeElRef.current.clientHeight || window.innerHeight - 56;

    // Convert hotspots to Globe points
    const gHotspots = filteredHotspots.map((h) => ({
      lat: h.lat,
      lng: h.lng,
      size: h.frpMw > 100 ? 0.5 : 0.35,
      color: h.severity === 'HIGH' ? '#F04438' : '#FF6B35',
      label: `${h.id}: ${h.classification} (${h.frpMw} MW)`,
    }));

    // Convert facilities to Globe points
    const gFacilities = facilities.map((f) => ({
      lat: f.lat,
      lng: f.lng,
      size: 0.25,
      color: '#3DB7D9',
      label: f.name,
    }));

    const allPoints = [...gHotspots, ...gFacilities];

    // Connection arcs for satellite orbital footprints
    const arcsData = [
      {
        startLat: 21.17,
        startLng: 72.83,
        endLat: 28.61,
        endLng: 77.2,
        color: ['#3DB7D9', '#FF6B35'],
      },
      {
        startLat: 21.17,
        startLng: 72.83,
        endLat: 19.07,
        endLng: 72.87,
        color: ['#3DB7D9', '#F04438'],
      },
    ];

    const world = (Globe as any)()(globeElRef.current)
      .width(width)
      .height(height)
      .globeImageUrl(getEarthNightTexture())
      .backgroundColor('#05080D')
      .atmosphereColor('#3DB7D9')
      .atmosphereAltitude(0.18)
      .pointsData(allPoints)
      .pointColor('color')
      .pointRadius('size')
      .pointAltitude(0.02)
      .arcsData(arcsData)
      .arcColor('color')
      .arcDashLength(0.4)
      .arcDashGap(0.2)
      .arcDashAnimateTime(2200)
      .arcStroke(0.5);

    // Initial Camera View: Centered on India (lat: 20.59, lng: 78.96)
    world.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2.1 }, 0);

    // Controls configuration
    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.5;

    // Handle click on Globe (India / Gujarat selection)
    world.onPointClick((point: any) => {
      world.controls().autoRotate = false;
      world.pointOfView({ lat: point.lat, lng: point.lng, altitude: 0.75 }, 1200);
      setShowRegionalBtn(true);
    });

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
  }, [filteredHotspots, facilities]);

  const handleEnterRegionalView = () => {
    setIsNavigating(true);
    setTimeout(() => {
      navigate('/command-center');
    }, 800);
  };

  const handleIncidentClick = (id: string) => {
    selectIncidentById(id);
    navigate(`/incidents/${id}`);
  };

  return (
    <div className="h-screen w-screen bg-[#05080D] text-[#F1F4F6] flex flex-col font-sans overflow-hidden selection:bg-[#3DB7D9] selection:text-[#05080D] relative">
      {/* Top Navigation Shell */}
      <header className="h-14 bg-[#081019] border-b border-[#253340] px-4 lg:px-6 flex items-center justify-between z-30 shrink-0 font-mono text-xs">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded bg-[#0D151E] border border-[#253340] flex items-center justify-center text-[#3DB7D9]">
            <Radar className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-sm tracking-wide text-white">FIREWATCH <span className="text-[#3DB7D9]">AI</span></span>
            <span className="text-[10px] text-[#A7B4C1] ml-2 px-1.5 py-0.5 bg-[#0D151E] border border-[#253340] rounded">
              SATELLITE THERMAL INTELLIGENCE
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center space-x-1 text-[#A7B4C1]">
          {[
            { label: 'Command Center', path: '/command-center' },
            { label: 'Incidents', path: '/incidents' },
            { label: 'Map Explorer', path: '/map-explorer' },
            { label: 'Facility Watch', path: '/facility-watch' },
            { label: 'Analytics', path: '/analytics' },
            { label: 'System Status', path: '/system-status' },
            { label: 'Methodology', path: '/methodology' },
            { label: 'Mission Brief', path: '/mission-brief' },
          ].map((link) => (
            <button
              key={link.path}
              onClick={() => navigate(link.path)}
              className="px-2.5 py-1 hover:text-white hover:bg-[#0D151E] rounded transition"
            >
              {link.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => navigate('/command-center')}
          className="px-3.5 py-1.5 bg-[#3DB7D9] hover:bg-[#287FB1] text-[#05080D] font-semibold rounded transition flex items-center space-x-1.5"
        >
          <span>OPEN COMMAND CENTER</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* Transition Banner */}
      {isNavigating && (
        <div className="absolute top-14 left-0 right-0 bg-[#3DB7D9] text-[#05080D] text-xs font-mono font-bold py-1 px-4 text-center tracking-wider animate-pulse z-50">
          TRANSITIONING TO REGIONAL GEOSPATIAL MAPLIBRE WORKSTATION...
        </div>
      )}

      {/* Full-Screen Globe Canvas Container */}
      <div className="flex-1 relative w-full h-full overflow-hidden">
        <div ref={globeElRef} className="w-full h-full bg-[#05080D]" />

        {/* LEFT SIDE: Identity Block */}
        <div className="absolute top-6 left-6 z-20 max-w-sm space-y-4 font-mono text-xs">
          <div className="p-4 bg-[#081019]/90 border border-[#253340] rounded-lg backdrop-blur-md space-y-3 shadow-2xl">
            <div className="space-y-0.5">
              <span className="text-[#3DB7D9] font-bold text-sm block">FIREWATCH AI</span>
              <span className="text-[11px] text-[#A7B4C1] uppercase block">SATELLITE THERMAL INTELLIGENCE</span>
              <span className="text-[10px] text-slate-400 block pt-1 border-t border-[#253340] mt-1">
                GUJARAT INDUSTRIAL CORRIDOR
              </span>
            </div>

            <p className="text-[#A7B4C1] text-xs leading-relaxed font-sans">
              Monitoring thermal anomalies across industrial infrastructure using satellite observations and geospatial context.
            </p>

            <div className="flex flex-col space-y-2 pt-1">
              <button
                onClick={() => {
                  if (globeInstanceRef.current) {
                    globeInstanceRef.current.pointOfView({ lat: 21.17, lng: 72.83, altitude: 0.75 }, 1200);
                  }
                  setShowRegionalBtn(true);
                }}
                className="w-full py-2 px-3 bg-[#3DB7D9] hover:bg-[#287FB1] text-[#05080D] font-semibold rounded text-xs transition flex items-center justify-center space-x-1.5 shadow"
              >
                <span>OPEN COMMAND CENTER</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => navigate('/mission-brief')}
                className="w-full py-2 px-3 bg-[#0D151E] hover:bg-[#111B25] border border-[#253340] text-[#F1F4F6] text-xs rounded transition flex items-center justify-center space-x-1.5"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#3DB7D9]" />
                <span>VIEW MISSION</span>
              </button>
            </div>
          </div>

          {/* Regional Fly-to CTA Button */}
          {showRegionalBtn && (
            <button
              onClick={handleEnterRegionalView}
              className="w-full py-2.5 px-4 bg-[#FF6B35] hover:bg-[#F04438] text-white font-bold rounded text-xs shadow-xl transition flex items-center justify-center space-x-2 animate-bounce"
            >
              <Compass className="w-4 h-4" />
              <span>ENTER REGIONAL VIEW (GUJARAT)</span>
            </button>
          )}
        </div>

        {/* LOWER LEFT: Observation Telemetry Overlay */}
        <div className="absolute bottom-6 left-6 z-20 p-3 bg-[#081019]/90 border border-[#253340] rounded-lg backdrop-blur-md font-mono text-xs w-64 space-y-1.5 shadow-xl">
          <div className="flex justify-between border-b border-[#253340] pb-1 text-[11px]">
            <span className="text-[#A7B4C1]">SENSOR:</span>
            <span className="text-white font-semibold">VIIRS (375m)</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#A7B4C1]">RESOLUTION:</span>
            <span className="text-slate-200">375 m (I-Band)</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#A7B4C1]">ACTIVE DETECTIONS:</span>
            <span className="text-[#FF6B35] font-bold">07</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#A7B4C1]">REGION:</span>
            <span className="text-white font-semibold">GUJARAT</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#A7B4C1]">LAST OBSERVATION:</span>
            <span className="text-slate-300">21:42 IST</span>
          </div>
        </div>

        {/* TOP RIGHT: Small Operational Status */}
        <div className="absolute top-6 right-6 z-20 p-3 bg-[#081019]/90 border border-[#253340] rounded-lg backdrop-blur-md font-mono text-xs space-y-1.5 shadow-xl w-60">
          <div className="flex items-center justify-between border-b border-[#253340] pb-1">
            <span className="font-semibold text-white">SYSTEM OPERATIONAL</span>
            <span className="w-2 h-2 rounded-full bg-[#39B978]" />
          </div>
          <div className="space-y-1 text-[10px] text-[#A7B4C1]">
            <div className="flex justify-between">
              <span>VIIRS DATA:</span>
              <strong className="text-[#39B978]">LIVE</strong>
            </div>
            <div className="flex justify-between">
              <span>GIS CONTEXT:</span>
              <strong className="text-white">READY</strong>
            </div>
            <div className="flex justify-between">
              <span>HISTORY ENGINE:</span>
              <strong className="text-white">READY</strong>
            </div>
            <div className="flex justify-between">
              <span>RULE ENGINE:</span>
              <strong className="text-[#3DB7D9]">ONLINE (BETA)</strong>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Latest Compact Observations Feed */}
        <div className="absolute bottom-6 right-6 z-20 p-3.5 bg-[#081019]/90 border border-[#253340] rounded-lg backdrop-blur-md font-mono text-xs w-72 space-y-2 shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#253340] pb-1.5">
            <span className="font-semibold text-[#3DB7D9] uppercase text-[11px]">LATEST OBSERVATIONS</span>
            <span className="text-[10px] text-[#A7B4C1]">07 TOTAL</span>
          </div>

          <div className="space-y-1.5">
            {filteredHotspots.slice(0, 4).map((item) => (
              <div
                key={item.id}
                onClick={() => handleIncidentClick(item.id)}
                className="p-2 bg-[#0D151E] border border-[#253340] hover:border-[#304150] rounded cursor-pointer transition flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-[#3DB7D9] text-[11px]">{item.id}</span>
                    <span className="text-[10px] text-[#A7B4C1]">{item.timeFormatted}</span>
                  </div>
                  <span className="text-[11px] text-white font-medium block truncate max-w-[170px]">
                    {item.classification}
                  </span>
                </div>

                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    item.severity === 'HIGH' ? 'bg-[#F04438]/20 text-[#F04438]' : 'bg-[#FF6B35]/20 text-[#FF6B35]'
                  }`}
                >
                  {item.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

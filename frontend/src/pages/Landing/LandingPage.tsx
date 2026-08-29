import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Globe from 'globe.gl';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Crosshair,
  Flame,
  Plus,
  Radar,
  X,
} from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { getEarthNightTexture } from '../../utils/earthTexture';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { filteredHotspots, facilities, selectIncidentById } = useIntelligence();
  const globeElRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);

  // Manual Beta Event Trigger State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [eventTitle, setEventTitle] = useState<string>('Surat Petrochemical Flare Anomaly');
  const [eventType, setEventType] = useState<string>('Industrial Fire');
  const [eventSeverity, setEventSeverity] = useState<string>('HIGH');
  const [eventLat, setEventLat] = useState<number>(21.1738);
  const [eventLng, setEventLng] = useState<number>(72.8345);
  const [eventFrp, setEventFrp] = useState<number>(184.6);
  const [eventLocation, setEventLocation] = useState<string>('Surat Petrochemical Industrial Zone');

  // Triggered Event Overlay State
  const [triggeredEvent, setTriggeredEvent] = useState<any>(null);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);

  // Clock String
  const [timeStr, setTimeStr] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST');
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize 3D Globe.GL Earth
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
      .pointAltitude(0.02);

    // Initial Camera View: Centered on India
    world.pointOfView({ lat: 20.5937, lng: 78.9629, altitude: 2.1 }, 0);
    world.controls().autoRotate = true;
    world.controls().autoRotateSpeed = 0.4;

    // Handle Globe Click to set Event Lat/Lng
    world.onGlobeClick(({ lat, lng }: { lat: number; lng: number }) => {
      setEventLat(parseFloat(lat.toFixed(4)));
      setEventLng(parseFloat(lng.toFixed(4)));
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

  // Execute Manual Beta Fire Event Animation Sequence
  const handleCreateManualEvent = () => {
    setIsModalOpen(false);

    const newEvt = {
      id: `FW-BETA-${Math.floor(1000 + Math.random() * 9000)}`,
      title: eventTitle,
      type: eventType,
      severity: eventSeverity,
      lat: eventLat,
      lng: eventLng,
      frpMw: eventFrp,
      locationName: eventLocation,
      source: 'MANUAL BETA EVENT',
    };

    setTriggeredEvent(newEvt);

    if (globeInstanceRef.current) {
      const world = globeInstanceRef.current;
      // 1. Stop Globe Rotation
      world.controls().autoRotate = false;
      // 2. Animate camera smoothly to event coordinates & zoom in
      world.pointOfView({ lat: eventLat, lng: eventLng, altitude: 0.65 }, 1400);

      // Add dynamic event point to Globe
      world.pointsData([
        ...world.pointsData(),
        {
          lat: eventLat,
          lng: eventLng,
          size: 0.8,
          color: '#F04438',
          label: `${newEvt.id}: ${newEvt.title}`,
        },
      ]);
    }
  };

  const handleOpenIncidentAnalysis = () => {
    setIsNavigating(true);
    setTimeout(() => {
      if (triggeredEvent) {
        selectIncidentById('FW-1042');
        navigate(`/incident/${triggeredEvent.id}`);
      } else {
        navigate('/command-center');
      }
    }, 800);
  };

  return (
    <div className="h-screen w-screen bg-[#05080D] text-[#F1F4F6] flex flex-col font-sans overflow-hidden relative selection:bg-[#3DB7D9] selection:text-[#05080D]">
      {/* Top Operations Header */}
      <header className="h-14 bg-[#081019] border-b border-[#253340] px-4 lg:px-6 flex items-center justify-between z-30 shrink-0 font-mono text-xs">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded bg-[#0D151E] border border-[#253340] flex items-center justify-center text-[#3DB7D9]">
            <Radar className="w-4 h-4" />
          </div>
          <div>
            <span className="font-semibold text-sm tracking-wide text-white">INDUSTRIAL FIREWATCH</span>
            <span className="text-[10px] text-[#A7B4C1] ml-2 px-1.5 py-0.5 bg-[#0D151E] border border-[#253340] rounded">
              SATELLITE THERMAL INTELLIGENCE & EMERGENCY RESPONSE
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center space-x-4 text-[#A7B4C1] text-[11px]">
          <div className="flex items-center space-x-1.5 text-[#39B978]">
            <span className="w-2 h-2 rounded-full bg-[#39B978]" />
            <span>SYSTEM ONLINE</span>
          </div>
          <span className="text-[#E8A93A] font-bold">BETA / SIMULATION</span>
          <span className="text-white">{timeStr}</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-3.5 py-1.5 bg-[#F04438] hover:bg-[#FF6B35] text-white font-semibold rounded transition flex items-center space-x-1.5 shadow"
          >
            <Plus className="w-4 h-4" />
            <span>TRIGGER MANUAL BETA EVENT</span>
          </button>
        </div>
      </header>

      {/* Navigating Banner */}
      {isNavigating && (
        <div className="absolute top-14 left-0 right-0 bg-[#3DB7D9] text-[#05080D] text-xs font-mono font-bold py-1.5 px-4 text-center tracking-wider animate-pulse z-50">
          OPENING EMERGENCY INCIDENT ANALYSIS WORKSPACE...
        </div>
      )}

      {/* 3D WebGL Globe Container */}
      <div className="flex-1 relative w-full h-full overflow-hidden">
        <div ref={globeElRef} className="w-full h-full bg-[#05080D]" />

        {/* LEFT SIDE: Mission Introduction */}
        <div className="absolute top-6 left-6 z-20 max-w-sm space-y-4 font-mono text-xs">
          <div className="p-4 bg-[#081019]/90 border border-[#253340] rounded-lg backdrop-blur-md space-y-3 shadow-2xl">
            <div>
              <span className="text-[#3DB7D9] font-bold text-sm block">GUJARAT INDUSTRIAL CORRIDOR</span>
              <p className="text-[#A7B4C1] text-xs leading-relaxed font-sans mt-1">
                Satellite-based thermal intelligence for industrial and environmental emergency response.
              </p>
            </div>

            <div className="flex flex-col space-y-2 pt-1">
              <button
                onClick={() => navigate('/command-center')}
                className="w-full py-2 px-3 bg-[#3DB7D9] hover:bg-[#287FB1] text-[#05080D] font-semibold rounded text-xs transition flex items-center justify-center space-x-1.5 shadow"
              >
                <span>ENTER OPERATIONS</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => navigate('/mission-brief')}
                className="w-full py-2 px-3 bg-[#0D151E] hover:bg-[#111B25] border border-[#253340] text-[#F1F4F6] text-xs rounded transition flex items-center justify-center space-x-1.5"
              >
                <BookOpen className="w-3.5 h-3.5 text-[#3DB7D9]" />
                <span>MISSION INFORMATION</span>
              </button>
            </div>
          </div>
        </div>

        {/* LOWER LEFT: Telemetry Strip */}
        <div className="absolute bottom-6 left-6 z-20 p-3 bg-[#081019]/90 border border-[#253340] rounded-lg backdrop-blur-md font-mono text-xs w-72 space-y-1.5 shadow-xl">
          <div className="flex justify-between border-b border-[#253340] pb-1 text-[11px]">
            <span className="text-[#A7B4C1]">ACTIVE INCIDENTS:</span>
            <span className="text-[#FF6B35] font-bold">07</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#A7B4C1]">MONITORED FACILITIES:</span>
            <span className="text-white">06 (Gujarat)</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#A7B4C1]">LAST OBSERVATION:</span>
            <span className="text-slate-300">21:42 IST</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#A7B4C1]">SENSOR:</span>
            <span className="text-[#3DB7D9]">VIIRS (375m)</span>
          </div>
        </div>

        {/* TOP RIGHT: System Status */}
        <div className="absolute top-6 right-6 z-20 p-3 bg-[#081019]/90 border border-[#253340] rounded-lg backdrop-blur-md font-mono text-xs space-y-1.5 shadow-xl w-60">
          <div className="flex items-center justify-between border-b border-[#253340] pb-1">
            <span className="font-semibold text-white">SYSTEM ONLINE</span>
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
              <strong className="text-[#3DB7D9]">ONLINE</strong>
            </div>
          </div>
        </div>

        {/* TRIGGERED EVENT OVERLAY & CALLOUT */}
        {triggeredEvent && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-30 p-4 bg-[#081019]/95 border-2 border-[#F04438] rounded-xl backdrop-blur-md font-mono text-xs w-96 space-y-3 shadow-2xl animate-pulse">
            <div className="flex items-center justify-between border-b border-[#F04438]/40 pb-2">
              <span className="font-bold text-[#F04438] flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>THERMAL EVENT DETECTED</span>
              </span>
              <span className="px-2 py-0.5 bg-[#F04438]/20 text-[#F04438] rounded font-bold text-[10px]">
                {triggeredEvent.source}
              </span>
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-white text-sm font-sans">{triggeredEvent.title}</h3>
              <p className="text-[11px] text-[#A7B4C1]">{triggeredEvent.locationName}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] bg-[#0D151E] p-2 rounded border border-[#253340]">
              <div>TYPE: <strong className="text-white">{triggeredEvent.type}</strong></div>
              <div>FRP: <strong className="text-[#E8A93A]">{triggeredEvent.frpMw} MW</strong></div>
            </div>

            <button
              onClick={handleOpenIncidentAnalysis}
              className="w-full py-2.5 px-4 bg-[#F04438] hover:bg-[#FF6B35] text-white font-bold rounded text-xs shadow-lg transition flex items-center justify-center space-x-2"
            >
              <Crosshair className="w-4 h-4" />
              <span>OPEN INCIDENT ANALYSIS</span>
            </button>
          </div>
        )}
      </div>

      {/* MANUAL BETA EVENT TRIGGER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#05080D]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-mono text-xs">
          <div className="bg-[#081019] border border-[#253340] rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[#253340] pb-3">
              <div className="flex items-center space-x-2">
                <Flame className="w-5 h-5 text-[#F04438]" />
                <h2 className="font-bold text-white text-base">TRIGGER MANUAL BETA FIRE EVENT</h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded text-[#A7B4C1] hover:text-white hover:bg-[#0D151E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-[#A7B4C1] uppercase block mb-1">EVENT TITLE</label>
                <input
                  type="text"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full p-2 bg-[#0D151E] border border-[#253340] rounded text-white text-xs focus:outline-none focus:border-[#3DB7D9]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#A7B4C1] uppercase block mb-1">EVENT TYPE</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="w-full p-2 bg-[#0D151E] border border-[#253340] rounded text-white text-xs focus:outline-none focus:border-[#3DB7D9]"
                  >
                    <option value="Industrial Fire">Industrial Fire</option>
                    <option value="Wildfire">Wildfire</option>
                    <option value="Unknown Thermal Event">Unknown Thermal Event</option>
                    <option value="Agricultural Fire">Agricultural Fire</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-[#A7B4C1] uppercase block mb-1">SEVERITY LEVEL</label>
                  <select
                    value={eventSeverity}
                    onChange={(e) => setEventSeverity(e.target.value)}
                    className="w-full p-2 bg-[#0D151E] border border-[#253340] rounded text-white text-xs focus:outline-none focus:border-[#3DB7D9]"
                  >
                    <option value="HIGH">High Priority</option>
                    <option value="CRITICAL">Critical Emergency</option>
                    <option value="MEDIUM">Medium Priority</option>
                    <option value="LOW">Low Priority</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#A7B4C1] uppercase block mb-1">LATITUDE</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={eventLat}
                    onChange={(e) => setEventLat(parseFloat(e.target.value))}
                    className="w-full p-2 bg-[#0D151E] border border-[#253340] rounded text-white text-xs focus:outline-none focus:border-[#3DB7D9]"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-[#A7B4C1] uppercase block mb-1">LONGITUDE</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={eventLng}
                    onChange={(e) => setEventLng(parseFloat(e.target.value))}
                    className="w-full p-2 bg-[#0D151E] border border-[#253340] rounded text-white text-xs focus:outline-none focus:border-[#3DB7D9]"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-[#A7B4C1] uppercase block mb-1">FRP RADIATIVE POWER (MW)</label>
                <input
                  type="number"
                  step="0.1"
                  value={eventFrp}
                  onChange={(e) => setEventFrp(parseFloat(e.target.value))}
                  className="w-full p-2 bg-[#0D151E] border border-[#253340] rounded text-white text-xs focus:outline-none focus:border-[#3DB7D9]"
                />
              </div>

              <div>
                <label className="text-[10px] text-[#A7B4C1] uppercase block mb-1">LOCATION NAME</label>
                <input
                  type="text"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  className="w-full p-2 bg-[#0D151E] border border-[#253340] rounded text-white text-xs focus:outline-none focus:border-[#3DB7D9]"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[#253340] flex justify-end space-x-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-[#0D151E] text-[#A7B4C1] hover:text-white rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateManualEvent}
                className="px-4 py-2 bg-[#F04438] hover:bg-[#FF6B35] text-white font-bold rounded flex items-center space-x-1.5"
              >
                <Flame className="w-4 h-4" />
                <span>CREATE INCIDENT (MANUAL BETA EVENT)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

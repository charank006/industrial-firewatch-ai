import React from 'react';
import { Radio, Flame, ShieldAlert, Cpu, Layers, ExternalLink, X, Activity, Globe, Zap } from 'lucide-react';

export interface SatelliteDossier {
  id: 'SUOMI_NPP' | 'NOAA_20';
  name: string;
  codeName: string;
  agency: string;
  sensor: string;
  band: string;
  spatialResolution: string;
  orbitInclination: string;
  altitudeKm: number;
  repetitionFrequency: string;
  whatItDoes: string;
  whatItCollects: string[];
  whatItShows: string[];
  firmsRelation: string;
  activeHotspotsDetected: number;
}

export const SATELLITE_DOSSIERS: Record<'SUOMI_NPP' | 'NOAA_20', SatelliteDossier> = {
  SUOMI_NPP: {
    id: 'SUOMI_NPP',
    name: 'Suomi National Polar-orbiting Partnership (SNPP)',
    codeName: 'SUOMI-NPP // VIIRS I-BAND ALPHA',
    agency: 'NASA / NOAA Joint Polar Satellite System',
    sensor: 'VIIRS (Visible Infrared Imaging Radiometer Suite)',
    band: 'I4 Band (3.740 - 3.920 μm Mid-Infrared Radiance)',
    spatialResolution: '375 Meters per Pixel (High Precision)',
    orbitInclination: '98.7° Near-Polar Sun-Synchronous',
    altitudeKm: 834,
    repetitionFrequency: '14 Orbits / Day (12-Hour Global Overpass)',
    whatItDoes: 'Executes high-resolution sub-kilometer thermal scans of Earth surface to detect high-temperature industrial flares, refinery blowdowns, and wildland fire perimeters.',
    whatItCollects: [
      '3.75μm Mid-Infrared Spectral Radiance (W/m²/sr)',
      'Brightness Temperature (Kelvin / °C)',
      'Fire Radiative Power (FRP in Megawatts)',
      'Sub-pixel Thermal Anomaly Geo-coordinates (Lat/Lng Polygons)'
    ],
    whatItShows: [
      'Exact location of uncontained industrial fires vs permitted flare stacks',
      'Instantaneous heat emission intensity spikes (+1,100% FRP over baseline)',
      'Perimeter expansion rate across wildland-urban interfaces (WUI)',
      'NASA FIRMS active thermal vector overlays updated within 30 minutes of overpass'
    ],
    firmsRelation: 'Acts as NASA FIRMS primary thermal anomaly trigger. GeoFlare AI ingests SNPP 375m VIIRS pixels and cross-references facility polygons to filter out registered refinery flares from uncontained plant fires.',
    activeHotspotsDetected: 1420
  },
  NOAA_20: {
    id: 'NOAA_20',
    name: 'NOAA-20 / JPSS-1 Operational Observatory',
    codeName: 'NOAA-20 // VIIRS M-BAND BETA',
    agency: 'NOAA / NASA Earth Science Mission Directorate',
    sensor: 'VIIRS Multispectral Dual-Channel Radiometer',
    band: 'M13 (3.75μm) & M15 (10.76μm) Dual-Band Spectrum',
    spatialResolution: '750m M-Band + 375m Intercalibrated Channel',
    orbitInclination: '98.7° Near-Polar Sun-Synchronous',
    altitudeKm: 824,
    repetitionFrequency: '14 Orbits / Day (50-Min Phase Offset behind SNPP)',
    whatItDoes: 'Provides 50-minute phase-shifted secondary thermal overpasses behind Suomi-NPP for rapid confidence verification, recurrence rate tracking, and smoke/aerosol optical depth analysis.',
    whatItCollects: [
      'Dual-Band Thermal Differential (ΔT = M13 - M15 Brightness Temp)',
      '180-Day Recurrence Rate Historical Thermal Baselines',
      'Surface Aerosol Optical Depth (AOD) & Plume Dispersion',
      'Background Surface Temperature Climatology'
    ],
    whatItShows: [
      'Secondary confidence verification: Confirms if fire is expanding or extinguished',
      'Structural fire propagation vs stationary industrial flare stacks',
      'Plume direction and atmospheric smoke dispersion for emergency dispatch',
      'Historical flare frequency audit tags across 180-day monitoring windows'
    ],
    firmsRelation: 'Provides the crucial 50-minute verification check for NASA FIRMS data. GeoFlare AI compares NOAA-20 detections against SNPP to generate the 3-part Confidence Verification (Boundary Check, Historical Recurrence, Intensity Baseline).',
    activeHotspotsDetected: 1180
  }
};

interface SatelliteDossierModalProps {
  dossier: SatelliteDossier | null;
  onClose: () => void;
  onLaunchFirmsAudit?: () => void;
}

export const SatelliteDossierModal: React.FC<SatelliteDossierModalProps> = ({
  dossier,
  onClose,
  onLaunchFirmsAudit
}) => {
  if (!dossier) return null;

  return (
    <div className="fixed left-4 top-16 z-40 w-[440px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-270px)] bg-[#080C14]/95 backdrop-blur-xl border border-cyan-500/50 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.9)] overflow-hidden text-slate-100 flex flex-col transition-all duration-300 animate-fadeIn">
      
      {/* Header Bar */}
      <div className="px-4 py-3 bg-[#0B1220] border-b border-cyan-500/30 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-400/40 text-cyan-400">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10px] text-cyan-400 font-bold uppercase tracking-widest">
                {dossier.codeName}
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full">
                LIVE TELEMETRY
              </span>
            </div>
            <h2 className="text-sm font-bold text-white font-sans tracking-wide leading-tight">
              {dossier.name}
            </h2>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Close Dossier"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body Scrollable */}
      <div className="p-4 overflow-y-auto space-y-4 text-xs font-mono custom-scrollbar">
        
        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 gap-2 bg-[#04070D] p-2.5 rounded-lg border border-slate-800 text-[10px]">
          <div>
            <span className="text-slate-500 text-[9px] uppercase tracking-wider block">AGENCY & MISSION</span>
            <p className="font-bold text-cyan-300 truncate">{dossier.agency}</p>
          </div>
          <div>
            <span className="text-slate-500 text-[9px] uppercase tracking-wider block">SPATIAL RESOLUTION</span>
            <p className="font-bold text-amber-400 truncate">{dossier.spatialResolution}</p>
          </div>
          <div>
            <span className="text-slate-500 text-[9px] uppercase tracking-wider block">ORBIT ALTITUDE</span>
            <p className="font-bold text-emerald-400 truncate">{dossier.altitudeKm} km ({dossier.orbitInclination})</p>
          </div>
          <div>
            <span className="text-slate-500 text-[9px] uppercase tracking-wider block">GLOBAL OVERPASS</span>
            <p className="font-bold text-slate-200 truncate">{dossier.repetitionFrequency}</p>
          </div>
        </div>

        {/* Section 1: What Does This Satellite Do? */}
        <div className="bg-[#0B1324]/70 border border-slate-800/80 p-3 rounded-lg space-y-1">
          <div className="flex items-center space-x-1.5 text-cyan-400 font-bold uppercase tracking-wider text-[10px]">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>1. WHAT THIS SATELLITE DOES</span>
          </div>
          <p className="text-slate-300 leading-relaxed font-sans text-[11px]">
            {dossier.whatItDoes}
          </p>
        </div>

        {/* Section 2: What It Collects */}
        <div className="bg-[#0B1324]/70 border border-slate-800/80 p-3 rounded-lg space-y-1.5">
          <div className="flex items-center space-x-1.5 text-amber-400 font-bold uppercase tracking-wider text-[10px]">
            <Cpu className="w-3.5 h-3.5 text-amber-400" />
            <span>2. WHAT IT COLLECTS (RAW SENSORY DATA)</span>
          </div>
          <ul className="space-y-1 text-slate-300 text-[11px]">
            {dossier.whatItCollects.map((item, idx) => (
              <li key={idx} className="flex items-start space-x-1.5">
                <span className="text-amber-400 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Section 3: What It Shows */}
        <div className="bg-[#0B1324]/70 border border-slate-800/80 p-3 rounded-lg space-y-1.5">
          <div className="flex items-center space-x-1.5 text-emerald-400 font-bold uppercase tracking-wider text-[10px]">
            <Flame className="w-3.5 h-3.5 text-emerald-400" />
            <span>3. WHAT IT REVEALS ON EARTH</span>
          </div>
          <ul className="space-y-1 text-slate-300 text-[11px]">
            {dossier.whatItShows.map((item, idx) => (
              <li key={idx} className="flex items-start space-x-1.5">
                <span className="text-emerald-400 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Section 4: NASA FIRMS & GeoFlare Project Integration */}
        <div className="bg-gradient-to-r from-cyan-950/50 via-[#0B1324]/90 to-indigo-950/50 border border-cyan-500/40 p-3 rounded-lg space-y-1">
          <div className="flex items-center space-x-1.5 text-cyan-300 font-bold uppercase tracking-wider text-[10px]">
            <ShieldAlert className="w-3.5 h-3.5 text-cyan-400" />
            <span>4. NASA FIRMS & GEOFLARE INTEGRATION</span>
          </div>
          <p className="text-slate-300 leading-relaxed font-sans text-[11px]">
            {dossier.firmsRelation}
          </p>
        </div>

      </div>

      {/* Footer Actions */}
      <div className="px-4 py-2.5 bg-[#0B1220] border-t border-cyan-500/30 flex items-center justify-between font-mono text-xs shrink-0">
        <div className="flex items-center space-x-1.5 text-slate-400 text-[10px]">
          <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>Active Hotspots: <strong className="text-white">{dossier.activeHotspotsDetected}</strong></span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onClose}
            className="px-2.5 py-1 rounded border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-[10px] transition cursor-pointer"
          >
            CLOSE
          </button>
          {onLaunchFirmsAudit && (
            <button
              onClick={() => {
                onClose();
                onLaunchFirmsAudit();
              }}
              className="px-3 py-1 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center space-x-1 text-[10px] transition shadow-[0_0_12px_rgba(56,189,248,0.4)] cursor-pointer"
            >
              <span>FIRMS AUDIT</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

    </div>
  );
};

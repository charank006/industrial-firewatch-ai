import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Compass,
} from 'lucide-react';
import { ReasoningFlow } from '../../components/intelligence/ReasoningFlow';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { useIntelligence } from '../../context/IntelligenceContext';

type TimeRange = '24h' | '7d' | '30d' | '180d';

function generateIncidentHistoricalFRP(incident: any, range: TimeRange) {
  const currentFRP = Number(incident?.frpMw || 25.0);
  const isPersistent = Boolean(incident?.isPersistent);
  const baseFrp = isPersistent
    ? Math.round(currentFRP * 0.85 * 10) / 10
    : Math.max(2.0, Math.round(currentFRP * 0.12 * 10) / 10);

  if (range === '24h') {
    return [
      { time: 'T-24h', frp: Math.round((baseFrp + 0.4) * 10) / 10, baseline: baseFrp },
      { time: 'T-18h', frp: Math.round((baseFrp - 0.2) * 10) / 10, baseline: baseFrp },
      { time: 'T-12h', frp: Math.round((baseFrp + 0.8) * 10) / 10, baseline: baseFrp },
      { time: 'T-6h', frp: Math.round((baseFrp * (isPersistent ? 1.0 : 1.6)) * 10) / 10, baseline: baseFrp },
      { time: 'T-3h', frp: Math.round((currentFRP * (isPersistent ? 0.9 : 0.6)) * 10) / 10, baseline: baseFrp },
      { time: 'T-1h', frp: Math.round((currentFRP * (isPersistent ? 0.95 : 0.85)) * 10) / 10, baseline: baseFrp },
      { time: 'Current', frp: currentFRP, baseline: baseFrp },
    ];
  } else if (range === '7d') {
    return [
      { time: 'Day -6', frp: Math.round((baseFrp + 0.5) * 10) / 10, baseline: baseFrp },
      { time: 'Day -5', frp: Math.round((baseFrp - 0.3) * 10) / 10, baseline: baseFrp },
      { time: 'Day -4', frp: Math.round((baseFrp + 0.9) * 10) / 10, baseline: baseFrp },
      { time: 'Day -3', frp: Math.round((baseFrp + 0.2) * 10) / 10, baseline: baseFrp },
      { time: 'Day -2', frp: Math.round((baseFrp * (isPersistent ? 1.0 : 1.4)) * 10) / 10, baseline: baseFrp },
      { time: 'Yesterday', frp: Math.round((currentFRP * (isPersistent ? 0.95 : 0.45)) * 10) / 10, baseline: baseFrp },
      { time: 'Today', frp: currentFRP, baseline: baseFrp },
    ];
  } else if (range === '30d') {
    return [
      { time: 'Wk -4', frp: Math.round((baseFrp - 0.2) * 10) / 10, baseline: baseFrp },
      { time: 'Wk -3', frp: Math.round((baseFrp + 0.6) * 10) / 10, baseline: baseFrp },
      { time: 'Wk -2', frp: Math.round((baseFrp + 0.3) * 10) / 10, baseline: baseFrp },
      { time: 'Wk -1', frp: Math.round((baseFrp * 1.1) * 10) / 10, baseline: baseFrp },
      { time: '4d ago', frp: Math.round((baseFrp * 1.2) * 10) / 10, baseline: baseFrp },
      { time: '2d ago', frp: Math.round((currentFRP * (isPersistent ? 0.9 : 0.35)) * 10) / 10, baseline: baseFrp },
      { time: 'Latest', frp: currentFRP, baseline: baseFrp },
    ];
  } else {
    // 180d
    return [
      { time: 'Mo -5', frp: Math.round((baseFrp + 0.4) * 10) / 10, baseline: baseFrp },
      { time: 'Mo -4', frp: Math.round((baseFrp - 0.5) * 10) / 10, baseline: baseFrp },
      { time: 'Mo -3', frp: Math.round((baseFrp + 0.8) * 10) / 10, baseline: baseFrp },
      { time: 'Mo -2', frp: Math.round((baseFrp - 0.1) * 10) / 10, baseline: baseFrp },
      { time: 'Mo -1', frp: Math.round((baseFrp * (isPersistent ? 1.02 : 1.1)) * 10) / 10, baseline: baseFrp },
      { time: '2wk ago', frp: Math.round((baseFrp * 1.2) * 10) / 10, baseline: baseFrp },
      { time: 'Active Spike', frp: currentFRP, baseline: baseFrp },
    ];
  }
}

export const IncidentDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hotspots, selectFacilityById } = useIntelligence();
  const [timeRange, setTimeRange] = React.useState<TimeRange>('7d');

  const incident = hotspots.find((h) => h.id === id) || hotspots[0];

  const handleFacilityClick = () => {
    selectFacilityById(incident.nearestFacilityId);
    navigate(`/facility-watch?facilityId=${incident.nearestFacilityId}`);
  };

  const chartData = React.useMemo(() => {
    return generateIncidentHistoricalFRP(incident, timeRange);
  }, [incident, timeRange]);

  const baselineValue = chartData[0]?.baseline || 15.0;
  const deviationPct = Math.round(((incident.frpMw - baselineValue) / baselineValue) * 100);

  return (
    <div className="min-h-screen bg-[#050A12] p-4 sm:p-6 space-y-6 font-sans text-[#F5F7FA]">
      {/* Top Header Navigation */}
      <div className="flex items-center justify-between border-b border-[#203246] pb-4 font-mono text-xs">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-[#16A9D9] hover:underline transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>BACK TO INCIDENTS REGISTRY</span>
        </button>

        <div className="flex items-center space-x-2">
          <span className="text-[#A7B4C5]">INCIDENT ID:</span>
          <span className="font-bold text-white text-sm bg-[#07101B] px-2.5 py-1 rounded border border-[#203246]">
            {incident.id}
          </span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Map & Context Panel (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-semibold text-[#16A9D9] uppercase tracking-wider flex items-center space-x-1.5">
                <Compass className="w-4 h-4" />
                <span>SPATIAL MAPLIBRE CONTEXT MAP</span>
              </span>
              <span className="text-[#A7B4C5]">500m & 2km RISK BUFFER RINGS</span>
            </div>

            <div className="h-[420px] rounded-lg overflow-hidden border border-[#203246] relative">
              <GISMapLibre height="h-full" />
            </div>
          </div>

          {/* Historical FRP Trend Chart with Interactive Time Filters */}
          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-4 space-y-3 font-mono">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-white/10 pb-2">
              <div className="space-y-0.5">
                <span className="font-semibold text-[#16A9D9] uppercase tracking-wider block">
                  HISTORICAL FRP VS BASELINE SPIKE
                </span>
                <span className="text-[10px] text-slate-400">
                  {incident.id} &bull; Baseline: <strong className="text-cyan-300">{baselineValue} MW</strong> &bull; Peak: <strong className="text-amber-400">{incident.frpMw} MW</strong> ({deviationPct >= 0 ? `+${deviationPct}%` : `${deviationPct}%`})
                </span>
              </div>

              {/* Interactive Time Range Filter Buttons */}
              <div className="flex items-center gap-1 bg-black/60 p-1 rounded-lg border border-white/10">
                {(['24h', '7d', '30d', '180d'] as TimeRange[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase transition cursor-pointer ${
                      timeRange === r
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                        : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-52 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#203246" />
                  <XAxis dataKey="time" stroke="#66768A" fontSize={10} />
                  <YAxis stroke="#66768A" fontSize={10} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#07101B', borderColor: '#203246', color: '#fff', fontSize: '11px', fontFamily: 'monospace' }}
                    formatter={(value: any, name: any) => [
                      `${value} MW`,
                      name === 'frp' ? 'Observed FRP' : 'Facility Baseline',
                    ]}
                  />
                  <Line type="monotone" dataKey="frp" name="frp" stroke="#FFB020" strokeWidth={2.5} dot={{ r: 4, fill: '#FFB020' }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="baseline" name="baseline" stroke="#16A9D9" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Right Intelligence Workbench Panel (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-5 space-y-3 shadow-2xl">
            <div className="flex items-center justify-between font-mono text-xs">
              <span
                className={`px-2.5 py-1 text-xs font-semibold rounded ${
                  incident.severity === 'HIGH' ? 'bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/40' : 'bg-[#FFB020]/20 text-[#FFB020]'
                }`}
              >
                {incident.severity} SEVERITY
              </span>
              <span className="text-[#28C76F] font-bold">
                CONFIDENCE: {incident.confidence}%
              </span>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-white tracking-wide">
                {incident.classification}
              </h2>
              <p className="text-xs text-[#A7B4C5] font-mono mt-1">{incident.locationName}</p>
            </div>

            {/* Nearest Facility Link */}
            <div className="p-3 bg-[#050A12] border border-[#203246] rounded-lg flex items-center justify-between font-mono text-xs">
              <div>
                <span className="text-[10px] text-[#16A9D9] uppercase block font-semibold">TARGET PROXIMITY</span>
                <span className="text-white font-bold">{incident.nearestFacilityName}</span>
              </div>
              <button
                onClick={handleFacilityClick}
                className="px-3 py-1 bg-[#111A26] hover:bg-[#151F2C] border border-[#203246] text-[#16A9D9] text-[11px] rounded transition flex items-center space-x-1"
              >
                <span>View Facility</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="bg-[#07101B] border border-[#203246] rounded-xl p-5">
            <ReasoningFlow
              steps={incident.reasoningSteps}
              classification={incident.classification}
              confidence={incident.confidence}
            />
          </div>

          <div className="bg-[#07101B] border border-[#FF3B30]/30 rounded-xl p-5 space-y-3 font-mono text-xs">
            <div className="flex items-center space-x-2 text-[#FF3B30] font-semibold text-sm">
              <AlertTriangle className="w-4 h-4" />
              <span>DISPATCH CHECKLIST</span>
            </div>
            <p className="text-slate-200 leading-relaxed font-sans text-xs">
              {incident.suggestedAction}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

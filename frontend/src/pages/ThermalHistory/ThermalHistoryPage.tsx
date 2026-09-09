import React, { useState, useMemo } from 'react';
import { History, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GISMapLibre } from '../../components/map/GISMapLibre';
import { MapLegend } from '../../components/map/MapLegend';
import { TimeScrubber } from '../../components/timeline/TimeScrubber';
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
    return [
      { time: 'Mo -5', frp: Math.round((baseFrp + 0.4) * 10) / 10, baseline: baseFrp },
      { time: 'Mo -4', frp: Math.round((baseFrp - 0.5) * 10) / 10, baseline: baseFrp },
      { time: 'Mo -3', frp: Math.round((baseFrp + 0.8) * 10) / 10, baseline: baseFrp },
      { time: 'Mo -2', frp: Math.round((baseFrp - 0.1) * 10) / 10, baseline: baseFrp },
      { time: 'Mo -1', frp: Math.round((baseFrp * (isPersistent ? 1.02 : 1.1)) * 10) / 10, baseline: baseFrp },
      { time: '2wk ago', frp: Math.round((baseFrp * 1.2) * 10) / 10, baseline: baseFrp },
      { time: 'Active', frp: currentFRP, baseline: baseFrp },
    ];
  }
}

export const ThermalHistoryPage: React.FC = () => {
  const { selectedIncident, filteredHotspots } = useIntelligence();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');

  const incident = selectedIncident || filteredHotspots[0];

  const chartData = useMemo(() => {
    return generateIncidentHistoricalFRP(incident, timeRange);
  }, [incident, timeRange]);

  const baselineValue = chartData[0]?.baseline || 15.0;

  return (
    <div className="h-[calc(100vh-5.75rem)] w-full flex flex-col bg-[#050A12] p-2 space-y-2 overflow-hidden font-sans text-[#F5F7FA]">
      {/* Page Title Bar */}
      <div className="flex items-center justify-between bg-[#07101B] border border-[#203246] rounded-lg p-3 font-mono text-xs shrink-0">
        <div className="flex items-center space-x-2">
          <History className="w-5 h-5 text-[#16A9D9]" />
          <div>
            <h1 className="font-semibold text-sm text-white tracking-wide">THERMAL HISTORY REPLAY</h1>
            <p className="text-[10px] text-[#A7B4C5]">REPLAY THERMAL EVOLUTION OVER PAST 180 DAYS ACROSS INDIA</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <span className="text-[#A7B4C5]">SELECTED INCIDENT:</span>
          <span className="px-2.5 py-1 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold rounded">
            {incident ? `${incident.id} • ${incident.classification}` : 'ALL INDIA LIVE FEED'}
          </span>
        </div>
      </div>

      {/* Main Map Replay Body */}
      <div className="flex-1 relative rounded-lg overflow-hidden border border-[#203246] min-h-0">
        <GISMapLibre height="h-full" />
        <MapLegend />

        {/* Floating Historical Pattern & Sparkline Card */}
        <div className="absolute top-4 left-4 z-[1000] p-3 bg-[#07101B]/95 border border-[#203246] rounded-lg backdrop-blur-md w-80 space-y-2.5 font-mono text-xs shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#203246] pb-1.5">
            <span className="font-semibold text-[#16A9D9] flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>FRP HISTORICAL TREND</span>
            </span>
            {/* Time Filter Tabs */}
            <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded border border-white/10">
              {(['24h', '7d', '30d', '180d'] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setTimeRange(r)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition cursor-pointer ${
                    timeRange === r
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 text-slate-300 text-[10.5px]">
            <div className="flex justify-between">
              <span>Incident ID:</span>
              <strong className="text-cyan-400">{incident?.id || 'FIRMS-IN-0001'}</strong>
            </div>
            <div className="flex justify-between">
              <span>Observed FRP:</span>
              <strong className="text-[#FFB020]">{incident?.frpMw || 18.5} MW</strong>
            </div>
            <div className="flex justify-between">
              <span>Baseline Level:</span>
              <strong className="text-slate-300">{baselineValue} MW</strong>
            </div>
            <div className="flex justify-between">
              <span>Persistence Audit:</span>
              <strong className={incident?.isPersistent ? 'text-purple-400' : 'text-emerald-400'}>
                {incident?.isPersistent ? '7-Day Persistent' : `${incident?.activeDays7d || 1}/7d Active`}
              </strong>
            </div>
          </div>

          {/* Sparkline Chart */}
          <div className="h-28 w-full pt-1 border-t border-white/10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="2 2" stroke="#203246" />
                <XAxis dataKey="time" stroke="#66768A" fontSize={8} />
                <YAxis stroke="#66768A" fontSize={8} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#07101B', borderColor: '#203246', color: '#fff', fontSize: '10px' }}
                />
                <Line type="monotone" dataKey="frp" stroke="#FFB020" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="baseline" stroke="#16A9D9" strokeDasharray="3 3" strokeWidth={1} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Temporal Timeline Scrubber */}
      <TimeScrubber />
    </div>
  );
};

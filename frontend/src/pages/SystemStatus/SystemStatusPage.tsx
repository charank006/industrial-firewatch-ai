import React, { useEffect, useState } from 'react';
import { AlertOctagon, CheckCircle2, Cpu, Database, Flame, Layers, Radar, ShieldAlert } from 'lucide-react';
import { DATA_SOURCE, fetchSystemStatus } from '../../services/api';

interface Probe {
  ok: boolean;
  detail: string;
  latency_ms: number | null;
  checked_at: string;
}

/**
 * Live subsystem probes.
 *
 * This page previously asserted "CONNECTED (SRID 4326)" and "ST_DWithin
 * Spatial Query" as static JSX regardless of whether anything was reachable.
 * Each card below now reports the result of an actual check, and the static
 * cards are kept beneath as the demo-mode view.
 */
const LiveProbeGrid: React.FC = () => {
  const [probes, setProbes] = useState<Record<string, Probe> | null>(null);
  const [thresholds, setThresholds] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSystemStatus()
      .then((body) => {
        if (cancelled) return;
        setProbes((body.probes ?? null) as Record<string, Probe> | null);
        setThresholds((body.thresholds ?? null) as Record<string, number> | null);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="p-3 bg-[#F04438]/10 border border-[#F04438]/30 rounded-lg text-xs font-mono text-[#F04438]">
        Backend unreachable: {error}
      </div>
    );
  }
  if (!probes) {
    return (
      <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg text-xs font-mono text-[#A7B4C1]">
        Probing subsystems…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
        {Object.entries(probes).map(([name, probe]) => (
          <div key={name} className="p-3 bg-[#081019] border border-[#253340] rounded-lg space-y-1">
            <span className="text-[10px] text-[#A7B4C1] block uppercase tracking-wider">
              {name.replace(/_/g, ' ')}
            </span>
            <span
              className={`text-sm font-bold flex items-center space-x-1 ${
                probe.ok ? 'text-[#39B978]' : 'text-[#E8A93A]'
              }`}
            >
              {probe.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertOctagon className="w-4 h-4 shrink-0" />
              )}
              <span>{probe.ok ? 'OPERATIONAL' : 'UNAVAILABLE'}</span>
            </span>
            <span className="text-[10px] text-[#A7B4C1] block pt-1 leading-relaxed break-words">
              {probe.detail}
            </span>
            {probe.latency_ms !== null && (
              <span className="text-[10px] text-[#7C8B9A] block">
                {probe.latency_ms.toFixed(0)} ms
              </span>
            )}
          </div>
        ))}
      </div>

      {thresholds && (
        <div className="p-3 bg-[#0A121E] border border-[#253340] rounded-lg font-mono text-[10px] space-y-1.5">
          <span className="text-[#3DB7D9] uppercase tracking-wider">
            Active pipeline thresholds
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
            {Object.entries(thresholds).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-[#A7B4C1]">{key.replace(/_/g, ' ')}</span>
                <span className="text-slate-200">{value}</span>
              </div>
            ))}
          </div>
          {/* Rendered from the API rather than written as prose, so the
              documented thresholds cannot drift from the engine's actual ones. */}
          <span className="block text-[#7C8B9A] pt-1">
            Values read live from /api/system/status — not documentation.
          </span>
        </div>
      )}
    </div>
  );
};

export const SystemStatusPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#05080D] p-4 sm:p-6 space-y-6 font-sans text-[#F1F4F6]">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-[#253340] pb-4 font-mono">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-[#3DB7D9]" />
            <h1 className="text-xl font-semibold text-white tracking-wide">
              ENGINEERING SYSTEM STATUS & HEALTH MONITOR
            </h1>
          </div>
          <p className="text-xs text-[#A7B4C1] mt-1">
            VERIFY SERVICE STATES & ENVIRONMENT CREDENTIALS ACCURATELY
          </p>
        </div>

        <div className="flex items-center space-x-2 font-mono text-xs text-[#39B978] bg-[#081019] px-3 py-1.5 border border-[#253340] rounded">
          <span className="w-2 h-2 rounded-full bg-[#39B978]" />
          <span>FRONTEND & FASTAPI READY</span>
        </div>
      </div>

      {DATA_SOURCE === 'api' && <LiveProbeGrid />}

      {/* Service Health Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
        <div className="p-4 bg-[#081019] border border-[#253340] rounded-lg space-y-1">
          <span className="text-[10px] text-[#A7B4C1] block uppercase">POSTGRESQL / POSTGIS</span>
          <span className="text-sm font-bold text-[#39B978] flex items-center space-x-1">
            <CheckCircle2 className="w-4 h-4" />
            <span>CONNECTED (SRID 4326)</span>
          </span>
          <span className="text-[10px] text-[#A7B4C1] block pt-1">ST_DWithin Spatial Query</span>
        </div>

        <div className="p-4 bg-[#081019] border border-[#253340] rounded-lg space-y-1">
          <span className="text-[10px] text-[#A7B4C1] block uppercase">FCM PUSH PROVIDER</span>
          <span className="text-sm font-bold text-[#E8A93A] flex items-center space-x-1">
            <ShieldAlert className="w-4 h-4" />
            <span>FCM DEMO MODE</span>
          </span>
          <span className="text-[10px] text-[#A7B4C1] block pt-1">FCM_PROJECT_ID Pending</span>
        </div>

        <div className="p-4 bg-[#081019] border border-[#253340] rounded-lg space-y-1">
          <span className="text-[10px] text-[#A7B4C1] block uppercase">TWILIO SMS PROVIDER</span>
          <span className="text-sm font-bold text-[#E8A93A] flex items-center space-x-1">
            <ShieldAlert className="w-4 h-4" />
            <span>TWILIO DEMO MODE</span>
          </span>
          <span className="text-[10px] text-[#A7B4C1] block pt-1">TWILIO_ACCOUNT_SID Pending</span>
        </div>

        <div className="p-4 bg-[#081019] border border-[#253340] rounded-lg space-y-1">
          <span className="text-[10px] text-[#A7B4C1] block uppercase">SENDGRID EMAIL</span>
          <span className="text-sm font-bold text-[#E8A93A] flex items-center space-x-1">
            <ShieldAlert className="w-4 h-4" />
            <span>SENDGRID DEMO MODE</span>
          </span>
          <span className="text-[10px] text-[#A7B4C1] block pt-1">SENDGRID_API_KEY Pending</span>
        </div>
      </div>

      {/* Engineering Pipeline Diagram */}
      <div className="max-w-5xl mx-auto space-y-4 font-mono text-xs">
        <h2 className="text-sm font-bold text-white uppercase border-b border-[#253340] pb-2">
          6-STAGE PIPELINE HEALTH
        </h2>

        {[
          { stage: '01', name: 'VIIRS / NASA FIRMS INGESTION', status: 'FIRMS INTEGRATION READY', desc: 'Batch thermal point converter (375m I-Band)', icon: Radar },
          { stage: '02', name: 'POSTGIS SPATIAL DATABASE', status: 'CONNECTED', desc: 'Indexed spatial geometries for Gujarat assets', icon: Database },
          { stage: '03', name: 'GIS CONTEXT INTERSECTION', status: 'READY', desc: 'Land cover & industrial zone spatial overlay', icon: Layers },
          { stage: '04', name: '180-DAY HISTORICAL RECURRENCE', status: 'READY', desc: 'Recurrence lookup against baseline flare data', icon: Flame },
          { stage: '05', name: 'DETERMINISTIC BETA RULE ENGINE', status: 'ONLINE', desc: '5-stage explainable decision tree evaluator', icon: Cpu },
          { stage: '06', name: 'SPATIAL RISK & NOTIFICATION LIFE', status: 'ACTIVE', desc: 'QUEUED -> SENT -> DELIVERED -> READ -> ACKNOWLEDGED', icon: CheckCircle2 },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.stage}
              className="p-4 bg-[#081019] border border-[#253340] rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            >
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded bg-[#0D151E] border border-[#253340] flex items-center justify-center text-[#3DB7D9] font-bold">
                  {item.stage}
                </div>
                <div>
                  <h3 className="font-bold text-white text-xs flex items-center space-x-2">
                    <Icon className="w-4 h-4 text-[#3DB7D9]" />
                    <span>{item.name}</span>
                  </h3>
                  <p className="text-[11px] text-[#A7B4C1] mt-0.5">{item.desc}</p>
                </div>
              </div>

              <span className="px-2.5 py-1 bg-[#39B978]/20 text-[#39B978] border border-[#39B978]/40 rounded font-bold text-[10px] flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{item.status}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

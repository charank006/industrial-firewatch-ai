import React from 'react';
import { CheckCircle2, Cpu, Database, Flame, Layers, Radar, Shield } from 'lucide-react';

export const SystemStatusPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#05080D] p-4 sm:p-6 space-y-6 font-sans text-[#F1F4F6]">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-[#253340] pb-4 font-mono">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-[#3DB7D9]" />
            <h1 className="text-xl font-semibold text-white tracking-wide">
              SYSTEM PIPELINE MONITOR
            </h1>
          </div>
          <p className="text-xs text-[#A7B4C1] mt-1">
            INGESTION & DETERMINISTIC RULE ENGINE HEALTH & LATENCY
          </p>
        </div>

        <div className="flex items-center space-x-2 font-mono text-xs text-[#39B978] bg-[#081019] px-3 py-1.5 border border-[#253340] rounded">
          <span className="w-2 h-2 rounded-full bg-[#39B978]" />
          <span>ALL PIPELINES OPERATIONAL</span>
        </div>
      </div>

      {/* Engineering Pipeline Diagram */}
      <div className="max-w-5xl mx-auto space-y-4 font-mono text-xs">
        {[
          {
            stage: '01',
            name: 'NASA FIRMS / VIIRS INGESTION',
            status: 'CONNECTED',
            records: '1,248 Hotspot Points',
            latency: '3 MIN AGO',
            icon: Radar,
          },
          {
            stage: '02',
            name: 'HOTSPOT DATABASE STORAGE',
            status: 'HEALTHY',
            records: '7 Active Gujarat Records',
            latency: '&lt; 10 ms',
            icon: Database,
          },
          {
            stage: '03',
            name: 'GIS CONTEXT & LAND COVER INTERSECTION',
            status: 'READY',
            records: '6 Industrial Assets / 4 Cover Types',
            latency: '15 ms',
            icon: Layers,
          },
          {
            stage: '04',
            name: '180-DAY HISTORICAL RECURRENCE ENGINE',
            status: 'READY',
            records: 'Historical Buffer Indexed',
            latency: '8 ms',
            icon: Flame,
          },
          {
            stage: '05',
            name: 'DETERMINISTIC BETA RULE CLASSIFIER',
            status: 'ONLINE',
            records: '7 Classifications Derived',
            latency: '&lt; 2 ms',
            icon: Cpu,
          },
          {
            stage: '06',
            name: 'RISK BUFFER SCORING & DISPATCH',
            status: 'ACTIVE',
            records: '500m / 1km / 2km Polygons Rendered',
            latency: '5 ms',
            icon: Shield,
          },
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
                  <p className="text-[11px] text-[#A7B4C1] mt-0.5" dangerouslySetInnerHTML={{ __html: item.records }} />
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <span className="text-[10px] text-[#A7B4C1]" dangerouslySetInnerHTML={{ __html: `LATENCY: ${item.latency}` }} />
                <span className="px-2.5 py-1 bg-[#39B978]/20 text-[#39B978] border border-[#39B978]/40 rounded font-bold text-[10px] flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{item.status}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

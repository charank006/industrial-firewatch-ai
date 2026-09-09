import React from 'react';
import { ShieldCheck, Clock, Flame, Radio, AlertOctagon, Cpu, AlertTriangle, Layers } from 'lucide-react';
import type { ReasoningStep } from '../../types';

interface ReasoningFlowProps {
  steps?: ReasoningStep[];
  classification: string;
  confidence: number;
  onDispatchAlert?: () => void;
}

export const ReasoningFlow: React.FC<ReasoningFlowProps> = ({
  steps,
  classification,
  confidence,
  onDispatchAlert,
}) => {
  const finalVerdict = classification.toUpperCase();

  const getStepIcon = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes('satellite') || l.includes('firms') || l.includes('viirs')) {
      return <Flame className="w-4 h-4 text-amber-400" />;
    }
    if (l.includes('persistence') || l.includes('7-day') || l.includes('filter')) {
      return <Clock className="w-4 h-4 text-purple-400" />;
    }
    if (l.includes('lightgbm') || l.includes('classifier') || l.includes('ml')) {
      return <Cpu className="w-4 h-4 text-cyan-400" />;
    }
    if (l.includes('response') || l.includes('action')) {
      return <AlertTriangle className="w-4 h-4 text-red-400" />;
    }
    return <Layers className="w-4 h-4 text-blue-400" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical':
        return <span className="px-2 py-0.5 bg-red-500/15 text-red-400 border border-red-500/40 rounded text-[9.5px] font-bold uppercase tracking-wider">CRITICAL</span>;
      case 'warning':
        return <span className="px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/40 rounded text-[9.5px] font-bold uppercase tracking-wider">OBSERVED</span>;
      case 'passed':
        return <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 rounded text-[9.5px] font-bold uppercase tracking-wider">VERIFIED</span>;
      default:
        return <span className="px-2 py-0.5 bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 rounded text-[9.5px] font-bold uppercase tracking-wider">EVALUATED</span>;
    }
  };

  return (
    <div className="space-y-3.5 font-mono text-xs">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>AI REASONING & VERIFICATION FLOW</span>
        </span>
        <span className="text-[10px] text-slate-300 bg-black/50 px-2.5 py-0.5 rounded border border-white/10">
          CONFIDENCE: <strong className="text-emerald-400 font-bold">{confidence}%</strong>
        </span>
      </div>

      {/* Dynamic 4-Stage Reasoning Breakdown or Fallback */}
      <div className="space-y-2">
        {steps && steps.length > 0 ? (
          steps.map((step, idx) => (
            <div
              key={step.stepIndex || idx}
              className="p-2.5 bg-[#080D1A] border border-white/10 rounded-lg space-y-1.5 transition hover:border-cyan-500/30"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    {getStepIcon(step.label)}
                  </div>
                  <span className="text-[10.5px] text-slate-200 font-bold uppercase">
                    Stage {step.stepIndex}: {step.label}
                  </span>
                </div>
                {getStatusBadge(step.status)}
              </div>
              <p className="text-[11px] text-slate-300 font-sans leading-relaxed pl-8">
                {step.detail}
              </p>
            </div>
          ))
        ) : (
          <>
            {/* PART 1: Boundary Check */}
            <div className="p-3 bg-[#080D1A] border border-white/10 rounded-lg flex items-center justify-between transition hover:border-cyan-500/30">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">BOUNDARY CHECK</div>
                  <div className="text-slate-200 text-[11px] font-sans font-medium">(Inside Plant Fence)</div>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 rounded text-[10px] font-bold uppercase tracking-wider">
                MATCH
              </span>
            </div>

            {/* PART 2: Historical Recurrence */}
            <div className="p-3 bg-[#080D1A] border border-white/10 rounded-lg flex items-center justify-between transition hover:border-amber-500/30">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">HISTORICAL RECURRENCE</div>
                  <div className="text-slate-200 text-[11px] font-sans font-medium">(0 hits in 180 days)</div>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-red-500/15 text-red-400 border border-red-500/40 rounded text-[10px] font-bold uppercase tracking-wider animate-pulse">
                UNPRECEDENTED
              </span>
            </div>

            {/* PART 3: Intensity vs Baseline */}
            <div className="p-3 bg-[#080D1A] border border-white/10 rounded-lg flex items-center justify-between transition hover:border-red-500/30">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded bg-red-500/10 border border-red-500/30 flex items-center justify-center shrink-0">
                  <Flame className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 uppercase font-bold">INTENSITY VS BASELINE</div>
                  <div className="text-slate-200 text-[11px] font-sans font-medium">(+1,100% FRP)</div>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-red-500/15 text-red-400 border border-red-500/40 rounded text-[10px] font-bold uppercase tracking-wider">
                ANOMALOUS
              </span>
            </div>
          </>
        )}
      </div>

      {/* FINAL SYSTEM VERDICT CARD WITH RED DISPATCH ALERT BUTTON */}
      <div className="p-3.5 bg-red-950/40 border border-red-500/50 rounded-xl space-y-2.5 shadow-[0_0_20px_rgba(239,68,68,0.25)] text-center relative overflow-hidden">
        <div className="flex items-center justify-center space-x-1.5 text-red-400 font-bold text-[10px] uppercase tracking-wider">
          <AlertOctagon className="w-4 h-4 animate-pulse text-red-500" />
          <span>CLASSIFICATION RESULT & ACTION</span>
        </div>
        <div className="text-sm font-extrabold text-white tracking-wider uppercase font-sans">
          {finalVerdict}
        </div>

        {onDispatchAlert && (
          <button
            onClick={onDispatchAlert}
            className="w-full py-2.5 mt-1 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-wider uppercase rounded-lg transition-all shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Dispatch Emergency Alert →</span>
          </button>
        )}
      </div>

    </div>
  );
};

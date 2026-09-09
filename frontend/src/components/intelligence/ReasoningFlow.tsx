/**
 * The engine's actual reasoning chain for one event.
 *
 * A previous version took `steps` and rendered none of them, showing three
 * fixed cards instead — "Inside Plant Fence: MATCH", "0 hits in 180 days:
 * UNPRECEDENTED", "+1,100% FRP: ANOMALOUS" — identical for every incident,
 * none of it computed. Worse, its verdict line mapped any class containing
 * "FIRE" or "ANOMALY" onto the literal string "CRITICAL INDUSTRIAL FIRE", so
 * an Unknown Anomaly at 40% confidence and LOW severity was announced as a
 * critical industrial fire. Four pages pass real steps to this component.
 */

import React from 'react';
import { AlertOctagon, CheckCircle2, HelpCircle, Radio, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { ReasoningStep } from '../../types';

interface ReasoningFlowProps {
  steps?: ReasoningStep[];
  classification: string;
  confidence: number;
  /** Optional: severity drives the verdict card's tone when supplied. */
  severity?: string;
  onDispatchAlert?: () => void;
}

const STATUS_STYLE: Record<
  ReasoningStep['status'],
  { icon: React.ReactNode; chip: string; tag: string }
> = {
  critical: {
    icon: <AlertOctagon className="w-4 h-4 text-red-400" />,
    chip: 'bg-red-500/10 border-red-500/30',
    tag: 'bg-red-500/15 text-red-400 border-red-500/40',
  },
  warning: {
    icon: <TriangleAlert className="w-4 h-4 text-amber-400" />,
    chip: 'bg-amber-500/10 border-amber-500/30',
    tag: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
  },
  passed: {
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    chip: 'bg-emerald-500/10 border-emerald-500/30',
    tag: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  },
  neutral: {
    icon: <HelpCircle className="w-4 h-4 text-slate-400" />,
    chip: 'bg-slate-500/10 border-slate-500/30',
    tag: 'bg-slate-500/15 text-slate-300 border-slate-500/40',
  },
};

/** Severity, not the class name, decides how loud the verdict card is. */
const VERDICT_TONE: Record<string, string> = {
  CRITICAL: 'bg-red-950/40 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.25)]',
  HIGH: 'bg-red-950/30 border-red-500/40',
  MEDIUM: 'bg-amber-950/30 border-amber-500/40',
  LOW: 'bg-[#080D1A] border-white/15',
};

export const ReasoningFlow: React.FC<ReasoningFlowProps> = ({
  steps = [],
  classification,
  confidence,
  severity,
  onDispatchAlert,
}) => {
  const tone = VERDICT_TONE[(severity ?? '').toUpperCase()] ?? VERDICT_TONE.LOW;
  const isUrgent = ['CRITICAL', 'HIGH'].includes((severity ?? '').toUpperCase());

  return (
    <div className="space-y-3.5 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider flex items-center space-x-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Why this was flagged</span>
        </span>
        <span className="text-[10px] text-slate-300 bg-black/50 px-2.5 py-0.5 rounded border border-white/10">
          CONFIDENCE: <strong className="text-emerald-400 font-bold">{confidence}%</strong>
        </span>
      </div>

      {steps.length === 0 ? (
        <div className="p-3 bg-[#080D1A] border border-white/10 rounded-lg text-[11px] text-slate-400">
          No reasoning recorded yet — the analysis job has not reached this event.
        </div>
      ) : (
        <div className="space-y-2">
          {steps.map((step) => {
            const style = STATUS_STYLE[step.status] ?? STATUS_STYLE.neutral;
            return (
              <div
                key={step.stepIndex}
                className="p-3 bg-[#080D1A] border border-white/10 rounded-lg flex items-start justify-between gap-3"
              >
                <div className="flex items-start space-x-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded border flex items-center justify-center shrink-0 ${style.chip}`}
                  >
                    {style.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] text-slate-400 uppercase font-bold">
                      {step.label}
                    </div>
                    <div className="text-slate-200 text-[11px] font-sans leading-snug">
                      {step.detail}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${style.tag}`}
                >
                  {step.status}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className={`p-3.5 border rounded-xl space-y-2.5 text-center ${tone}`}>
        <div className="flex items-center justify-center space-x-1.5 text-slate-300 font-bold text-[10px] uppercase tracking-wider">
          {isUrgent && <AlertOctagon className="w-4 h-4 animate-pulse text-red-500" />}
          <span>Most probable source</span>
        </div>
        {/* The engine's own label and severity, verbatim. */}
        <div className="text-sm font-extrabold text-white tracking-wider uppercase font-sans">
          {classification}
        </div>
        {severity && (
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">
            {severity} severity
          </div>
        )}

        {onDispatchAlert && (
          <button
            onClick={onDispatchAlert}
            className="w-full py-2.5 mt-1 bg-red-600 hover:bg-red-500 text-white font-bold text-xs tracking-wider uppercase rounded-lg transition-all flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Radio className="w-4 h-4" />
            <span>Dispatch Emergency Alert →</span>
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Operational risk, shown apart from classification confidence.
 *
 * The two answer different questions and can disagree: "94% sure this is a
 * crop fire, and it is not dangerous" and "75% sure this is an industrial
 * fire, and it is urgent" both have to be sayable. Putting them side by side
 * as one number would lose exactly that.
 */

import React from 'react';
import { ShieldAlert } from 'lucide-react';

const TONE: Record<string, string> = {
  EXTREME: 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/50',
  HIGH: 'bg-[#FF6B22]/15 text-[#FF6B22] border-[#FF6B22]/50',
  MODERATE: 'bg-[#E8A93A]/15 text-[#E8A93A] border-[#E8A93A]/45',
  LOW: 'bg-[#2FA87C]/12 text-[#3DD69C] border-[#2FA87C]/40',
};

interface RiskBadgeProps {
  score?: number;
  level?: string;
  /** Tracked as an incident, i.e. above the actionability threshold. */
  actionable?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ score, level, actionable }) => {
  if (score === undefined || level === undefined) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-[#243244] text-[#6F7E8D]">
        NOT SCORED
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border whitespace-nowrap ${
          TONE[level] ?? TONE.LOW
        }`}
        title={`Operational risk ${score}% — separate from classification confidence`}
      >
        RISK {Math.round(score)}%
      </span>
      {actionable && (
        <span
          className="inline-flex items-center gap-1 text-[9px] font-mono text-[#F04438]"
          title="Above the risk threshold, so it is tracked as an active incident"
        >
          <ShieldAlert className="w-3 h-3" />
          INCIDENT
        </span>
      )}
    </span>
  );
};

/**
 * The "is this a fire at all?" verdict, as a compact badge.
 *
 * Deliberately rendered in its own column rather than merged into the class
 * label: a source classification attached to a probable sensor artefact is
 * worse than no label at all, so the two must stay visually separate.
 */

import React from 'react';
import { VERDICT_LABEL, VERDICT_TONE } from './formatters';
import type { ValidityDetail } from '../../types';

interface ValidityBadgeProps {
  verdict?: ValidityDetail['verdict'];
  confidencePct?: number;
}

export const ValidityBadge: React.FC<ValidityBadgeProps> = ({ verdict, confidencePct }) => {
  if (!verdict) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono border border-[#243244] text-[#6F7E8D]">
        NOT ASSESSED
      </span>
    );
  }

  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border whitespace-nowrap ${VERDICT_TONE[verdict]}`}
      title={`${confidencePct ?? '—'}% likely a genuine fire`}
    >
      {VERDICT_LABEL[verdict]}
      {confidencePct !== undefined && <span className="opacity-70"> {confidencePct}%</span>}
    </span>
  );
};

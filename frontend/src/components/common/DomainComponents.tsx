import React from 'react';
import { 
  ShieldAlert, 
  Flame, 
  Radio, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Zap, 
  Users, 
  Activity,
  Bell,
  Building2
} from 'lucide-react';

export interface SeverityBadgeProps {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'HISTORICAL' | string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export const IncidentSeverityBadge: React.FC<SeverityBadgeProps> = ({
  severity,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const norm = severity.toUpperCase();
  let styles = 'bg-[#111B25] text-[#A7B4C1] border-[#253340]';
  let dotColor = 'bg-gray-400';

  if (norm.includes('CRITICAL') || norm.includes('EXTREME')) {
    styles = 'bg-[#f04438]/15 text-[#F04438] border-[#f04438]/40';
    dotColor = 'bg-[#F04438] animate-pulse';
  } else if (norm.includes('HIGH')) {
    styles = 'bg-[#ff6b35]/15 text-[#FF6B35] border-[#ff6b35]/40';
    dotColor = 'bg-[#FF6B35]';
  } else if (norm.includes('MEDIUM') || norm.includes('MODERATE') || norm.includes('ANOMALY')) {
    styles = 'bg-[#e8a93a]/15 text-[#E8A93A] border-[#e8a93a]/40';
    dotColor = 'bg-[#E8A93A]';
  } else if (norm.includes('LOW') || norm.includes('VERIFIED')) {
    styles = 'bg-[#39b978]/15 text-[#39B978] border-[#39b978]/40';
    dotColor = 'bg-[#39B978]';
  } else if (norm.includes('HISTORICAL') || norm.includes('ARCHIVED')) {
    styles = 'bg-[#f59e0b]/15 text-[#F59E0B] border-[#f59e0b]/40';
    dotColor = 'bg-[#F59E0B]';
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5 text-[9px] font-mono tracking-wider',
    md: 'px-2 py-0.5 text-[10px] font-mono tracking-wider',
    lg: 'px-2.5 py-1 text-xs font-mono tracking-widest',
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-semibold uppercase border ${styles} ${sizeClasses} ${className}`}
    >
      {showIcon && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
      <span>{severity}</span>
    </span>
  );
};

export interface StatusBadgeProps {
  status: 'CONFIRMED_CRITICAL' | 'VERIFIED_HIGH_RISK' | 'AI_ANOMALY' | 'AWAITING_VERIFICATION' | 'RESOLVED' | 'ARCHIVED' | string;
  className?: string;
}

export const IncidentStatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const norm = status.toUpperCase();
  let label = status.replace(/_/g, ' ');
  let colorClass = 'bg-[#111B25] text-[#A7B4C1] border-[#253340]';
  let Icon = Clock;

  if (norm.includes('CRITICAL') || norm.includes('CONFIRMED')) {
    label = 'CONFIRMED CRITICAL';
    colorClass = 'bg-red-950/40 text-red-400 border-red-800/50';
    Icon = ShieldAlert;
  } else if (norm.includes('HIGH_RISK') || norm.includes('VERIFIED')) {
    label = 'VERIFIED HIGH RISK';
    colorClass = 'bg-orange-950/40 text-orange-400 border-orange-800/50';
    Icon = Flame;
  } else if (norm.includes('ANOMALY')) {
    label = 'AI ANOMALY';
    colorClass = 'bg-amber-950/40 text-amber-400 border-amber-800/50';
    Icon = Activity;
  } else if (norm.includes('AWAITING') || norm.includes('PENDING')) {
    label = 'AWAITING VERIFICATION';
    colorClass = 'bg-yellow-950/40 text-yellow-300 border-yellow-800/40';
    Icon = Clock;
  } else if (norm.includes('RESOLVED')) {
    label = 'RESOLVED';
    colorClass = 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50';
    Icon = CheckCircle2;
  } else if (norm.includes('ARCHIVED') || norm.includes('HISTORICAL')) {
    label = 'HISTORICAL / ARCHIVED';
    colorClass = 'bg-slate-900 text-slate-400 border-slate-700/50';
    Icon = Clock;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono tracking-wider uppercase border ${colorClass} ${className}`}>
      <Icon className="w-3 h-3" />
      <span>{label}</span>
    </span>
  );
};

export interface DataSourceBadgeProps {
  source: string;
  className?: string;
}

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({ source, className = '' }) => {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0D151E] text-[#3DB7D9] border border-[#253340] text-[10px] font-mono tracking-wider uppercase ${className}`}>
      <Radio className="w-3 h-3 text-[#3DB7D9]" />
      <span>{source}</span>
    </span>
  );
};

export interface RiskIndicatorProps {
  score: number; // 0 to 100
  label?: string;
  className?: string;
}

export const RiskIndicator: React.FC<RiskIndicatorProps> = ({ score, label = 'SPATIAL RISK INDEX', className = '' }) => {
  let riskColor = 'text-[#39B978]';
  let barColor = 'bg-[#39B978]';
  let riskLevel = 'LOW';

  if (score >= 80) {
    riskColor = 'text-[#F04438]';
    barColor = 'bg-[#F04438]';
    riskLevel = 'EXTREME';
  } else if (score >= 60) {
    riskColor = 'text-[#FF6B35]';
    barColor = 'bg-[#FF6B35]';
    riskLevel = 'HIGH';
  } else if (score >= 35) {
    riskColor = 'text-[#E8A93A]';
    barColor = 'bg-[#E8A93A]';
    riskLevel = 'MODERATE';
  }

  return (
    <div className={`space-y-1.5 font-mono ${className}`}>
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-[#A7B4C1] uppercase tracking-wider">{label}</span>
        <span className={`font-bold ${riskColor}`}>
          {score.toFixed(0)}% &bull; {riskLevel}
        </span>
      </div>
      <div className="w-full bg-[#05080D] h-1.5 rounded-full overflow-hidden border border-[#253340]">
        <div
          className={`h-full transition-all duration-500 rounded-full ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
    </div>
  );
};

export interface ClassificationConfidenceProps {
  confidence: number; // e.g. 91
  rulesApplied?: string[];
  className?: string;
}

export const ClassificationConfidence: React.FC<ClassificationConfidenceProps> = ({
  confidence,
  rulesApplied = ['Deterministic Rule Engine', 'Thermal Recurrence Check'],
  className = '',
}) => {
  return (
    <div className={`p-3 rounded bg-[#0D151E] border border-[#253340] space-y-2 font-mono ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#A7B4C1] uppercase tracking-wider flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-[#3DB7D9]" />
          DETERMINISTIC CONFIDENCE
        </span>
        <span className="text-xs font-bold text-[#3DB7D9]">{confidence}% CONFIDENCE</span>
      </div>

      <div className="w-full bg-[#05080D] h-1.5 rounded-full overflow-hidden border border-[#253340]">
        <div
          className="h-full bg-[#3DB7D9] transition-all duration-500 rounded-full"
          style={{ width: `${confidence}%` }}
        />
      </div>

      {rulesApplied.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {rulesApplied.map((rule, idx) => (
            <span key={idx} className="px-1.5 py-0.5 rounded bg-[#111B25] border border-[#253340] text-[9px] text-[#A7B4C1]">
              {rule}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export interface ThermalEvidenceProps {
  frpMw: number; // Fire Radiative Power in MW
  brightnessTempK: number; // Kelvin
  clusterAreaKm2: number;
  scanAngle?: number;
  recurrenceCount?: number;
  className?: string;
}

export const ThermalEvidence: React.FC<ThermalEvidenceProps> = ({
  frpMw,
  brightnessTempK,
  clusterAreaKm2,
  scanAngle = 12.4,
  recurrenceCount = 3,
  className = '',
}) => {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono ${className}`}>
      <div className="p-2.5 rounded bg-[#0D151E] border border-[#253340]">
        <span className="text-[9px] text-[#6F7E8D] uppercase tracking-wider block">FRP ENERGY</span>
        <span className="text-sm font-bold text-[#FF6B35]">{frpMw} MW</span>
      </div>

      <div className="p-2.5 rounded bg-[#0D151E] border border-[#253340]">
        <span className="text-[9px] text-[#6F7E8D] uppercase tracking-wider block">BRIGHTNESS</span>
        <span className="text-sm font-bold text-[#F1F4F6]">{brightnessTempK} K</span>
      </div>

      <div className="p-2.5 rounded bg-[#0D151E] border border-[#253340]">
        <span className="text-[9px] text-[#6F7E8D] uppercase tracking-wider block">CLUSTER AREA</span>
        <span className="text-sm font-bold text-[#3DB7D9]">{clusterAreaKm2} km²</span>
        <span className="text-[8.5px] text-[#6F7E8D] block font-mono">ANGLE: {scanAngle}°</span>
      </div>

      <div className="p-2.5 rounded bg-[#0D151E] border border-[#253340]">
        <span className="text-[9px] text-[#6F7E8D] uppercase tracking-wider block">HIST RECURRENCE</span>
        <span className="text-sm font-bold text-[#A7B4C1]">{recurrenceCount} PASSES</span>
      </div>
    </div>
  );
};

export interface NotificationStatusProps {
  channel: 'FCM' | 'SMS' | 'EMAIL';
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'ACKNOWLEDGED' | 'FAILED' | 'READY_BETA';
  recipientCount?: number;
  className?: string;
}

export const NotificationStatusBadge: React.FC<NotificationStatusProps> = ({
  channel,
  status,
  recipientCount = 1,
  className = '',
}) => {
  let statusColor = 'text-amber-400 bg-amber-950/40 border-amber-800/40';

  if (status === 'DELIVERED' || status === 'ACKNOWLEDGED') {
    statusColor = 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
  } else if (status === 'FAILED') {
    statusColor = 'text-red-400 bg-red-950/40 border-red-800/50';
  } else if (status === 'READY_BETA') {
    statusColor = 'text-cyan-400 bg-cyan-950/40 border-cyan-800/50';
  }

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded bg-[#0D151E] border border-[#253340] font-mono text-[10px] ${className}`}>
      <Bell className="w-3.5 h-3.5 text-[#3DB7D9]" />
      <span className="text-[#F1F4F6] font-bold">{channel}</span>
      <span className="text-[#6F7E8D]">&bull;</span>
      <span className={`px-1.5 py-0.2 rounded border uppercase font-semibold text-[9px] ${statusColor}`}>
        {status.replace(/_/g, ' ')}
      </span>
      {recipientCount > 0 && <span className="text-[#6F7E8D]">({recipientCount} RECP)</span>}
    </div>
  );
};

export interface SpatialRiskSummaryProps {
  dangerRadiusKm: number;
  facilitiesAtRisk: number;
  populationAtRisk: number;
  nearestStationDistanceKm: number;
  className?: string;
}

export const SpatialRiskSummary: React.FC<SpatialRiskSummaryProps> = ({
  dangerRadiusKm,
  facilitiesAtRisk,
  populationAtRisk,
  nearestStationDistanceKm,
  className = '',
}) => {
  return (
    <div className={`p-3 rounded bg-[#0D151E] border border-[#253340] space-y-3 font-mono ${className}`}>
      <div className="flex items-center justify-between border-b border-[#253340] pb-2">
        <span className="text-[10px] text-[#A7B4C1] uppercase tracking-wider font-bold">SPATIAL IMPACT ASSESSMENT</span>
        <span className="text-[10px] text-[#3DB7D9]">BUFFER: {dangerRadiusKm} KM RADIUS</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#111B25] p-2 rounded border border-[#253340]">
          <Building2 className="w-4 h-4 text-[#FF6B35] mx-auto mb-1" />
          <div className="text-xs font-bold text-[#F1F4F6]">{facilitiesAtRisk}</div>
          <div className="text-[8.5px] text-[#6F7E8D] uppercase">FACILITIES</div>
        </div>

        <div className="bg-[#111B25] p-2 rounded border border-[#253340]">
          <Users className="w-4 h-4 text-[#E8A93A] mx-auto mb-1" />
          <div className="text-xs font-bold text-[#F1F4F6]">{populationAtRisk.toLocaleString()}</div>
          <div className="text-[8.5px] text-[#6F7E8D] uppercase font-mono">POPULATION</div>
        </div>

        <div className="bg-[#111B25] p-2 rounded border border-[#253340]">
          <ShieldAlert className="w-4 h-4 text-[#39B978] mx-auto mb-1" />
          <div className="text-xs font-bold text-[#F1F4F6]">{nearestStationDistanceKm} km</div>
          <div className="text-[8.5px] text-[#6F7E8D] uppercase">FIRE STATION</div>
        </div>
      </div>
    </div>
  );
};

export interface OperationalPanelProps {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export const OperationalPanel: React.FC<OperationalPanelProps> = ({
  title,
  subtitle,
  badge,
  headerAction,
  children,
  footer,
  className = '',
}) => {
  return (
    <div className={`bg-[#0D151E] border border-[#253340] rounded-lg flex flex-col overflow-hidden shadow-lg ${className}`}>
      {/* Panel Header */}
      <div className="px-4 py-3 bg-[#111B25] border-b border-[#253340] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#3DB7D9] shrink-0" />
          <div className="truncate">
            <h3 className="text-xs font-mono font-bold text-[#F1F4F6] uppercase tracking-wider truncate">{title}</h3>
            {subtitle && <p className="text-[10px] font-mono text-[#6F7E8D] truncate">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {headerAction}
        </div>
      </div>

      {/* Panel Body */}
      <div className="p-4 flex-1">{children}</div>

      {/* Panel Footer */}
      {footer && <div className="px-4 py-2 bg-[#080D14] border-t border-[#253340] text-[10px] font-mono text-[#6F7E8D]">{footer}</div>}
    </div>
  );
};

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const OperationalEmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = AlertTriangle,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`p-8 text-center bg-[#0D151E] border border-[#253340] rounded-lg font-mono space-y-3 ${className}`}>
      <div className="w-10 h-10 rounded-full bg-[#111B25] border border-[#253340] flex items-center justify-center mx-auto text-[#6F7E8D]">
        <Icon className="w-5 h-5" />
      </div>
      <div className="space-y-1">
        <h4 className="text-xs font-bold text-[#F1F4F6] uppercase tracking-wider">{title}</h4>
        <p className="text-[11px] text-[#6F7E8D] max-w-sm mx-auto leading-relaxed font-sans">{description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-3 py-1.5 bg-[#111B25] hover:bg-[#1B2936] text-[#3DB7D9] border border-[#253340] rounded text-[10px] uppercase font-bold tracking-wider transition cursor-pointer"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

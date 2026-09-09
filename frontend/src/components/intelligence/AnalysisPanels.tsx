/**
 * Panels for the pipeline data the original UI had nowhere to display:
 * weather baselines, OSM surroundings, class probabilities and impact.
 *
 * Purely additive - written in the existing visual register (mono labels,
 * #081019 surfaces, #253340 borders, #3DB7D9 accent) so they read as part of
 * the dashboard rather than bolted on. Nothing existing is restyled.
 *
 * Every panel renders null when its data is absent, so a fire that has not
 * been analysed simply shows fewer panels rather than empty scaffolding.
 */

import React from 'react';
import {
  AlertTriangle,
  CloudDrizzle,
  Factory,
  Info,
  Wind,
} from 'lucide-react';
import type {
  ImpactDetail,
  PredictionDetail,
  SurroundingsDetail,
  WeatherDetail,
} from '../../types';
import { bearingToCompass, signed } from './formatters';

const CLASS_COLOUR: Record<string, string> = {
  persistent_thermal_source: '#A855F7',
  forest_fire: '#10B981',
  agricultural_burning: '#FFB020',
  industrial_fire: '#FF3B30',
  gas_oil_flare: '#FF6B22',
  urban_other: '#38BDF8',
  unknown: '#66768A',
  industrial: '#FF3B30',
  flare: '#FF6B22',
  forest: '#10B981',
  agriculture: '#FFB020',
  gas_oil: '#FF6B22',
  urban: '#38BDF8',
};

const CLASS_LABEL: Record<string, string> = {
  persistent_thermal_source: 'Persistent Thermal Source',
  forest_fire: 'Forest Fire',
  agricultural_burning: 'Agricultural Burning',
  industrial_fire: 'Industrial Fire',
  gas_oil_flare: 'Routine Flare / Gas Oil',
  urban_other: 'Urban / Other',
  unknown: 'Unknown Anomaly',
  industrial: 'Industrial Fire',
  flare: 'Routine Flare',
  forest: 'Forest Fire',
  agriculture: 'Agricultural Burning',
  gas_oil: 'Gas/Oil Flare',
  urban: 'Urban',
};

export const PanelShell: React.FC<{
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, icon, badge, children }) => (
  <div className="border border-[#253340] rounded-lg bg-[#0A121E] p-3 space-y-2.5">
    <div className="flex items-center justify-between font-mono">
      <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#3DB7D9]">
        {icon}
        {title}
      </span>
      {badge}
    </div>
    {children}
  </div>
);

const Metric: React.FC<{ label: string; value: React.ReactNode; accent?: string }> = ({
  label,
  value,
  accent = 'text-slate-100',
}) => (
  <div className="bg-[#0D151E] border border-[#1E2C3B] rounded p-2">
    <span className="block text-[9px] uppercase tracking-wider text-[#A7B4C1] font-mono">
      {label}
    </span>
    <span className={`block text-sm font-mono font-semibold ${accent}`}>{value}</span>
  </div>
);

/** Small caveat line. Used wherever the spec requires an explicit disclaimer. */
const Caveat: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex gap-1.5 text-[10px] leading-relaxed text-[#7C8B9A] font-mono">
    <Info className="w-3 h-3 shrink-0 mt-0.5" />
    <span>{children}</span>
  </p>
);

const QualityBadge: React.FC<{ quality: string | null }> = ({ quality }) => {
  if (!quality) return null;
  const tone =
    quality === 'ok'
      ? 'bg-[#2FA87C]/15 text-[#3DD69C] border-[#2FA87C]/40'
      : quality === 'unavailable'
        ? 'bg-[#F04438]/15 text-[#F04438] border-[#F04438]/40'
        : 'bg-[#E8A93A]/15 text-[#E8A93A] border-[#E8A93A]/40';
  return (
    <span className={`px-1.5 py-0.5 text-[9px] font-mono rounded border ${tone}`}>
      {quality.toUpperCase()}
    </span>
  );
};

function anomalyTone(value: number | null): string {
  if (value === null) return 'text-slate-400';
  if (value >= 2) return 'text-[#F04438]';
  if (value >= 0.5) return 'text-[#E8A93A]';
  return 'text-slate-100';
}

// --- Weather --------------------------------------------------------------

export const WeatherPanel: React.FC<{ weather: WeatherDetail | null }> = ({ weather }) => {
  if (!weather) return null;

  return (
    <PanelShell
      title="Local Weather & 6-Day Baseline"
      icon={<CloudDrizzle className="w-3 h-3" />}
      badge={<QualityBadge quality={weather.baselineQuality} />}
    >
      <div className="grid grid-cols-2 gap-2">
        <Metric
          label="Current Temp"
          value={weather.currentTemperatureC !== null ? `${weather.currentTemperatureC.toFixed(1)} °C` : '—'}
        />
        <Metric
          label={`${weather.baselineDaysRequested}-Day Baseline`}
          value={weather.baselineTemperatureC !== null ? `${weather.baselineTemperatureC.toFixed(1)} °C` : '—'}
        />
        <Metric
          label="Temp Anomaly"
          value={signed(weather.temperatureAnomalyC, 2, ' °C')}
          accent={anomalyTone(weather.temperatureAnomalyZ)}
        />
        <Metric
          label="Anomaly (z-score)"
          value={weather.temperatureAnomalyZ !== null ? weather.temperatureAnomalyZ.toFixed(2) : '—'}
          accent={anomalyTone(weather.temperatureAnomalyZ)}
        />
        <Metric
          label="Humidity"
          value={weather.currentHumidityPct !== null ? `${weather.currentHumidityPct.toFixed(0)} %` : '—'}
        />
        <Metric label="Humidity Anomaly" value={signed(weather.humidityAnomalyPct, 1, ' %')} />
        <Metric
          label="Wind"
          value={
            weather.windSpeedMs !== null
              ? `${weather.windSpeedMs.toFixed(1)} m/s ${bearingToCompass(weather.windDirectionDeg)}`
              : '—'
          }
        />
        <Metric
          label="VPD"
          value={weather.vpdKpa !== null ? `${weather.vpdKpa.toFixed(2)} kPa` : '—'}
          accent={weather.vpdKpa !== null && weather.vpdKpa >= 3 ? 'text-[#F04438]' : 'text-slate-100'}
        />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-[#A7B4C1]">
        <span>
          24H RAIN <strong className="text-slate-200">{(weather.precipitation24hMm ?? 0).toFixed(1)} mm</strong>
        </span>
        <span>
          72H RAIN <strong className="text-slate-200">{(weather.precipitation72hMm ?? 0).toFixed(1)} mm</strong>
        </span>
        <span>
          DRY HOURS <strong className="text-slate-200">{weather.dryHours ?? 0} h</strong>
        </span>
        {weather.localHour && (
          <span>
            LOCAL HOUR <strong className="text-slate-200">{weather.localHour} ({weather.timezone ?? 'UTC'})</strong>
          </span>
        )}
      </div>

      {/* Spec Rule 2 - weather anomaly is supporting context, not fire proof. */}
      <Caveat>{weather.interpretation}</Caveat>
    </PanelShell>
  );
};

// --- Surroundings ---------------------------------------------------------

export const SurroundingsPanel: React.FC<{ surroundings: SurroundingsDetail | null }> = ({
  surroundings,
}) => {
  if (!surroundings) return null;

  return (
    <PanelShell
      title={`Surroundings (${(surroundings.radiusM / 1000).toFixed(0)} km radius)`}
      icon={<Factory className="w-3 h-3" />}
      badge={<QualityBadge quality={surroundings.osmCoverage} />}
    >
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Factories" value={surroundings.factoriesWithin1km ?? '—'} />
        <Metric
          label="Gas Facilities"
          value={surroundings.gasFacilitiesWithin1km ?? '—'}
          accent={(surroundings.gasFacilitiesWithin1km ?? 0) > 0 ? 'text-[#E8A93A]' : 'text-slate-100'}
        />
        <Metric label="Power" value={surroundings.powerInfraWithin1km ?? '—'} />
        <Metric label="Buildings" value={surroundings.buildingCount ?? '—'} />
        <Metric
          label="Hospitals"
          value={surroundings.hospitals ?? '—'}
          accent={(surroundings.hospitals ?? 0) > 0 ? 'text-[#E8A93A]' : 'text-slate-100'}
        />
        <Metric label="Schools" value={surroundings.schools ?? '—'} />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-[#A7B4C1]">
        <span>
          LAND COVER <strong className="text-slate-200">{surroundings.landCover ?? '—'}</strong>
        </span>
        {surroundings.insideIndustrial && (
          <span className="text-[#F04438]">INSIDE INDUSTRIAL PERIMETER</span>
        )}
        {surroundings.nearestFactoryM !== null && (
          <span>
            NEAREST FACTORY{' '}
            <strong className="text-slate-200">{surroundings.nearestFactoryM.toFixed(0)} m</strong>
          </span>
        )}
        <span>
          OSM ELEMENTS <strong className="text-slate-200">{surroundings.osmElementCount ?? 0}</strong>
        </span>
      </div>

      {/* Spec Rule 4 - missing OSM data is not evidence of absence. */}
      {surroundings.osmCoverage !== 'ok' && <Caveat>{surroundings.coverageCaveat}</Caveat>}
    </PanelShell>
  );
};

// --- Class probabilities --------------------------------------------------

export const ProbabilityPanel: React.FC<{ prediction: PredictionDetail | null }> = ({
  prediction,
}) => {
  if (!prediction) return null;

  const isPersistent = prediction.prediction === ('persistent_thermal_source' as any) || prediction.modelKind === 'persistence_filter';

  if (isPersistent) {
    return (
      <PanelShell
        title="Source Classification"
        icon={<AlertTriangle className="w-3 h-3 text-purple-400" />}
        badge={
          <span className="px-1.5 py-0.5 text-[9px] font-mono rounded border bg-purple-500/15 text-purple-300 border-purple-500/40">
            PERSISTENT SOURCE
          </span>
        }
      >
        <div className="bg-purple-950/30 border border-purple-500/30 rounded p-3 space-y-1.5 font-mono">
          <div className="flex items-center gap-2 text-purple-200 font-semibold text-xs">
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
            7-Day Persistence Pre-Filter: Passed
          </div>
          <p className="text-[11px] text-purple-200/90 leading-relaxed">
            Continuous thermal activity confirmed across 5+ days in the 7-day observation window within 500m radius.
          </p>
          <div className="pt-1 text-[10px] text-purple-300/80 border-t border-purple-500/20">
            <strong>Architecture Decision:</strong> LightGBM ML Classifier was <em>bypassed</em> because persistent thermal sources represent routine flare stacks or continuous industrial furnaces.
          </div>
        </div>
      </PanelShell>
    );
  }

  // Canonical classes to show (ignoring legacy duplicate keys if both exist)
  const canonicalOrder: string[] = [
    'forest_fire',
    'agricultural_burning',
    'industrial_fire',
    'gas_oil_flare',
    'urban_other',
    'unknown',
  ];

  const rawEntries = Object.entries(prediction.probabilities || {});
  // Prefer canonical keys if available, otherwise fallback to whatever exists
  const hasCanonical = rawEntries.some(([k]) => canonicalOrder.includes(k));
  const filteredEntries = hasCanonical
    ? rawEntries.filter(([k]) => canonicalOrder.includes(k))
    : rawEntries;

  const ranked = (filteredEntries as Array<[string, number]>).sort((a, b) => b[1] - a[1]);

  return (
    <PanelShell
      title="LightGBM Multiclass ML Probabilities"
      icon={<AlertTriangle className="w-3 h-3" />}
      badge={
        <span className="px-1.5 py-0.5 text-[9px] font-mono rounded border bg-[#3DB7D9]/15 text-[#3DB7D9] border-[#3DB7D9]/40">
          {prediction.confidencePct}% CONFIDENCE
        </span>
      }
    >
      <div className="space-y-1.5">
        {ranked.map(([cls, probability]) => {
          const isTop = cls === prediction.prediction || CLASS_LABEL[cls] === prediction.label;
          return (
            <div key={cls} className="space-y-0.5">
              <div className="flex justify-between text-[10px] font-mono">
                <span className={isTop ? 'text-slate-100 font-semibold' : 'text-[#A7B4C1]'}>
                  {CLASS_LABEL[cls] || cls}
                </span>
                <span className={isTop ? 'text-slate-100 font-semibold' : 'text-[#A7B4C1]'}>
                  {(probability * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 bg-[#0D151E] rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${Math.max(1, probability * 100)}%`,
                    backgroundColor: CLASS_COLOUR[cls] || '#66768A',
                    opacity: isTop ? 1 : 0.45,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-[#A7B4C1] pt-1">
        <span>
          MODEL <strong className="text-slate-200">{prediction.modelVersion}</strong>
        </span>
        <span>
          DATA QUALITY{' '}
          <strong className="text-slate-200">{(prediction.dataQuality * 100).toFixed(0)}%</strong>
        </span>
      </div>

      {/* Spec Rule 8 - probabilities, never a determination of cause. */}
      <Caveat>{prediction.interpretation || 'Most probable source category, derived from 32-feature LightGBM model.'}</Caveat>
    </PanelShell>
  );
};

// --- Impact ---------------------------------------------------------------

const RISK_TONE: Record<string, string> = {
  EXTREME: 'bg-[#F04438]/20 text-[#F04438] border-[#F04438]/40',
  HIGH: 'bg-[#FF6B22]/20 text-[#FF6B22] border-[#FF6B22]/40',
  MODERATE: 'bg-[#E8A93A]/20 text-[#E8A93A] border-[#E8A93A]/40',
  LOW: 'bg-[#2FA87C]/20 text-[#3DD69C] border-[#2FA87C]/40',
};

export const ImpactPanel: React.FC<{ impact: ImpactDetail | null }> = ({ impact }) => {
  if (!impact) return null;

  const exposureRows: Array<[string, number | undefined]> = [
    ['Buildings', impact.exposed.buildings],
    ['Factories', impact.exposed.factories],
    ['Gas / Oil sites', impact.exposed.gas_facilities],
    ['Power infra', impact.exposed.power_infrastructure],
    ['Hospitals', impact.exposed.hospitals],
    ['Schools', impact.exposed.schools],
  ];

  return (
    <PanelShell
      title="Impact & Exposure"
      icon={<Wind className="w-3 h-3" />}
      badge={
        <span
          className={`px-1.5 py-0.5 text-[9px] font-mono rounded border ${
            RISK_TONE[impact.riskLevel] ?? RISK_TONE.MODERATE
          }`}
        >
          {impact.riskLevel} RISK
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Metric
          label="Immediate Hazard"
          value={impact.coreRadiusM !== null ? `${impact.coreRadiusM.toFixed(0)} m` : '—'}
        />
        <Metric
          label="Plume Corridor"
          value={impact.downwindLengthM !== null ? `${impact.downwindLengthM.toFixed(0)} m` : '—'}
        />
        <Metric
          label="Wind"
          value={
            impact.windSpeedMs !== null
              ? `${impact.windSpeedMs.toFixed(1)} m/s ${bearingToCompass(impact.windDirectionDeg)}`
              : '—'
          }
        />
        <Metric
          label="Plume Bearing"
          value={
            impact.plumeBearingDeg !== null
              ? `${impact.plumeBearingDeg.toFixed(0)}° ${bearingToCompass(impact.plumeBearingDeg)}`
              : 'Omnidirectional'
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
        {exposureRows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <span className="text-[#A7B4C1]">{label}</span>
            <span className="text-slate-200">{value ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <span className="block text-[9px] uppercase tracking-wider text-[#A7B4C1] font-mono">
          Potential Pollutants
        </span>
        <div className="flex flex-wrap gap-1">
          {impact.potentialPollutants.map((pollutant) => (
            <span
              key={pollutant}
              className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-[#0D151E] border border-[#1E2C3B] text-[#A7B4C1]"
            >
              {pollutant}
            </span>
          ))}
        </div>
      </div>

      {impact.notes.map((note) => (
        <p key={note} className="flex gap-1.5 text-[10px] leading-relaxed text-[#E8A93A] font-mono">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{note}</span>
        </p>
      ))}

      {/* Spec section 22 / Rule 7 - potential, never measured. */}
      <Caveat>{impact.pollutantCaveat}</Caveat>
    </PanelShell>
  );
};

export const FacilityExposureNote: React.FC<{ count: number }> = ({ count }) => (
  <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#A7B4C1]">
    <Factory className="w-3 h-3" />
    <span>{count} exposure factor(s) contributing to severity</span>
  </div>
);

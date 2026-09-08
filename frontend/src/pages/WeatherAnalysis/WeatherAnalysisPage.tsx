/**
 * Six-day weather baseline detail (spec sections 8-10).
 *
 * A new route rather than another panel: the baseline methodology, its sample
 * quality and the derived anomaly set need more room than the drawer has, and
 * this is the page that explains HOW the anomaly is computed rather than just
 * reporting it.
 */

import React from 'react';
import { CloudDrizzle, Info, Thermometer, Wind } from 'lucide-react';
import { useIntelligence } from '../../context/IntelligenceContext';
import { ActiveFireBar } from '../../components/intelligence/ActiveFireBar';
import { WeatherPanel } from '../../components/intelligence/AnalysisPanels';
import { bearingToCompass } from '../../components/intelligence/formatters';

const Stat: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="bg-[#081019] border border-[#253340] rounded-lg p-3">
    <span className="block text-[10px] uppercase tracking-wider text-[#A7B4C1] font-mono">
      {label}
    </span>
    <span className="block text-xl font-mono font-semibold text-slate-100 mt-1">{value}</span>
    {hint && <span className="block text-[10px] text-[#7C8B9A] font-mono mt-0.5">{hint}</span>}
  </div>
);

export const WeatherAnalysisPage: React.FC = () => {
  const { selectedIncident, analysis, isAnalysisLoading, dataSource } = useIntelligence();
  const weather = analysis?.weather ?? null;

  return (
    <div className="p-6 space-y-5 font-sans text-slate-200 max-w-6xl">
      <ActiveFireBar section="Weather & 6-day baseline" />
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-100">
          <CloudDrizzle className="w-5 h-5 text-[#3DB7D9]" />
          Weather Baseline Analysis
        </h1>
        <p className="text-xs text-[#A7B4C1] font-mono">
          Six-day same-local-hour baseline at the detection coordinate
          {selectedIncident ? ` — ${selectedIncident.id}` : ''}
        </p>
      </div>

      {dataSource === 'mock' && (
        <div className="p-3 bg-[#E8A93A]/10 border border-[#E8A93A]/30 rounded-lg text-xs font-mono text-[#E8A93A]">
          Running on bundled demo data. Weather baselines come from the live pipeline — set
          VITE_DATA_SOURCE=api to populate this page.
        </div>
      )}

      {dataSource === 'api' && isAnalysisLoading && (
        <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg text-xs font-mono text-[#A7B4C1]">
          Loading weather analysis…
        </div>
      )}

      {dataSource === 'api' && !isAnalysisLoading && !weather && (
        <div className="p-3 bg-[#081019] border border-[#253340] rounded-lg text-xs font-mono text-[#A7B4C1]">
          No weather analysis for this event yet. Weather is attached during enrichment.
        </div>
      )}

      {weather && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              label="Current Temperature"
              value={
                weather.currentTemperatureC !== null
                  ? `${weather.currentTemperatureC.toFixed(1)} °C`
                  : '—'
              }
              hint={weather.localHour ? `at local ${weather.localHour.slice(11)}` : undefined}
            />
            <Stat
              label="6-Day Baseline"
              value={
                weather.baselineTemperatureC !== null
                  ? `${weather.baselineTemperatureC.toFixed(2)} °C`
                  : '—'
              }
              hint={`${weather.baselineSamples}/${weather.baselineDaysRequested} days used`}
            />
            <Stat
              label="Temperature Anomaly"
              value={
                weather.temperatureAnomalyC !== null
                  ? `${weather.temperatureAnomalyC > 0 ? '+' : ''}${weather.temperatureAnomalyC.toFixed(2)} °C`
                  : '—'
              }
              hint={
                weather.temperatureAnomalyZ !== null
                  ? `z = ${weather.temperatureAnomalyZ.toFixed(2)}`
                  : undefined
              }
            />
            <Stat
              label="Baseline Quality"
              value={weather.baselineQuality.toUpperCase()}
              hint={
                weather.baselineQuality === 'ok'
                  ? 'all six days available'
                  : 'anomalies degraded accordingly'
              }
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <WeatherPanel weather={weather} />

            <div className="space-y-4">
              <div className="border border-[#253340] rounded-lg bg-[#0A121E] p-3 space-y-2">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#3DB7D9] font-mono">
                  <Thermometer className="w-3 h-3" />
                  How the baseline is computed
                </span>
                <ol className="space-y-1.5 text-[11px] leading-relaxed text-slate-300 list-decimal list-inside font-sans">
                  <li>
                    The detection timestamp (UTC) is shifted into the fire&apos;s own local
                    timezone and floored to the hour.
                  </li>
                  <li>
                    The same local hour is sampled on each of the previous six days. Days are
                    subtracted on the local wall clock, so the comparison does not drift across a
                    daylight-saving boundary.
                  </li>
                  <li>
                    Unavailable hours are dropped, never imputed. Below four of six samples the
                    baseline is marked <span className="font-mono text-[#E8A93A]">insufficient</span>{' '}
                    and no anomaly is reported.
                  </li>
                  <li>
                    The anomaly is expressed as a z-score against the baseline&apos;s own spread,
                    because the same +7 °C means very different things in a stable tropical climate
                    and a volatile continental one.
                  </li>
                </ol>
              </div>

              <div className="border border-[#253340] rounded-lg bg-[#0A121E] p-3 space-y-2">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#3DB7D9] font-mono">
                  <Wind className="w-3 h-3" />
                  Derived conditions
                </span>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono">
                  <dt className="text-[#A7B4C1]">Wind</dt>
                  <dd className="text-slate-200 text-right">
                    {weather.windSpeedMs !== null
                      ? `${weather.windSpeedMs.toFixed(1)} m/s from ${bearingToCompass(weather.windDirectionDeg)}`
                      : '—'}
                  </dd>
                  <dt className="text-[#A7B4C1]">Wind change vs baseline</dt>
                  <dd className="text-slate-200 text-right">
                    {weather.windChangeMs !== null ? `${weather.windChangeMs.toFixed(2)} m/s` : '—'}
                  </dd>
                  <dt className="text-[#A7B4C1]">Temperature trend</dt>
                  <dd className="text-slate-200 text-right">
                    {weather.temperatureTrendCPerDay !== null
                      ? `${weather.temperatureTrendCPerDay.toFixed(3)} °C/day`
                      : '—'}
                  </dd>
                  <dt className="text-[#A7B4C1]">Vapour pressure deficit</dt>
                  <dd className="text-slate-200 text-right">
                    {weather.vpdKpa !== null ? `${weather.vpdKpa.toFixed(3)} kPa` : '—'}
                  </dd>
                  <dt className="text-[#A7B4C1]">VPD anomaly</dt>
                  <dd className="text-slate-200 text-right">
                    {weather.vpdAnomalyKpa !== null
                      ? `${weather.vpdAnomalyKpa > 0 ? '+' : ''}${weather.vpdAnomalyKpa.toFixed(3)} kPa`
                      : '—'}
                  </dd>
                  <dt className="text-[#A7B4C1]">Rain, last 24h / 72h</dt>
                  <dd className="text-slate-200 text-right">
                    {weather.precipitation24hMm ?? '—'} / {weather.precipitation72hMm ?? '—'} mm
                  </dd>
                  <dt className="text-[#A7B4C1]">Hours since rain</dt>
                  <dd className="text-slate-200 text-right">{weather.dryHours ?? '—'}</dd>
                </dl>
              </div>
            </div>
          </div>

          {/* Spec Rule 2, stated prominently on the page that could most
              easily be misread as attributing cause. */}
          <div className="flex gap-2 p-3 bg-[#0A121E] border border-[#253340] rounded-lg text-[11px] leading-relaxed text-[#A7B4C1] font-mono">
            <Info className="w-4 h-4 shrink-0 text-[#3DB7D9] mt-0.5" />
            <span>{weather.interpretation}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default WeatherAnalysisPage;

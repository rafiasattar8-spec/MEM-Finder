import React, { useMemo } from 'react';
import { Download, Printer, X } from 'lucide-react';
import type {
  AnySite,
  EarthAnalogSite,
  FactorWeights,
  MatchResult,
  PlanetarySite,
  PowerClimatology,
  ReverseMatchResult,
  WeightPresetId,
} from '../types/mem';
import { normalizeFactorWeights } from '../utils/similarityEngine';
import { RadarChartSvg } from './RadarChartSvg';

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  selectedSite: AnySite;
  activeTargetSite: PlanetarySite;
  rankedEarthMatches: MatchResult[];
  bestPlanetaryMatch: ReverseMatchResult | null;
  weights: FactorWeights;
  activePreset: WeightPresetId | 'custom';
  powerCache: Record<string, PowerClimatology>;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  open,
  onClose,
  selectedSite,
  activeTargetSite,
  rankedEarthMatches,
  bestPlanetaryMatch,
  weights,
  activePreset,
  powerCache,
}) => {
  const targetPlanetary: PlanetarySite =
    selectedSite.world === 'earth'
      ? bestPlanetaryMatch?.planetarySite ?? activeTargetSite
      : (selectedSite as PlanetarySite);

  const primaryMatch =
    selectedSite.world === 'earth'
      ? rankedEarthMatches.find((m) => m.earthSite.id === selectedSite.id) ??
        rankedEarthMatches[0]
      : rankedEarthMatches[0];

  const analogEarth: EarthAnalogSite | null = primaryMatch?.earthSite ?? null;
  const earthPower = analogEarth ? powerCache[analogEarth.id] : undefined;
  const normW = normalizeFactorWeights(weights);

  // Deduplicated list of all datasets & sources across the 20 sub-factors for this match
  const uniqueSources = useMemo(() => {
    if (!primaryMatch) return [];
    const seen = new Set<string>();
    const list: Array<{ group: string; dataset: string; source: string; resolution: string; mode: string }> = [];
    for (const grp of primaryMatch.groupOrder) {
      for (const sf of grp.subFactors) {
        if (sf.skipped) continue;
        const key = `${sf.dataset}|${sf.source}`;
        if (!seen.has(key)) {
          seen.add(key);
          list.push({
            group: grp.label,
            dataset: sf.dataset,
            source: sf.source,
            resolution: sf.resolution,
            mode: sf.mode === 'live' ? 'Live' : 'Pre-processed',
          });
        }
      }
    }
    return list;
  }, [primaryMatch]);

  if (!open) return null;

  const handleDownloadBrief = () => {
    const lines = [
      'MEM FINDER — ONE-PAGE MISSION ANALOG BRIEF',
      "Tagline: Find Earth's twin for every Moon and Mars mission.",
      'Worlds: Moon · Earth · Mars',
      `Generated: ${new Date().toISOString()}`,
      '====================================================================',
      '',
      `TARGET SITE: ${targetPlanetary.name} (${targetPlanetary.world.toUpperCase()})`,
      `Coordinates: ${targetPlanetary.lat.toFixed(2)}°, ${targetPlanetary.lon.toFixed(2)}° · ${targetPlanetary.region}`,
      `Rock/Soil: ${targetPlanetary.terrain.rock_soil_type.value ?? '—'} · Slope: ${targetPlanetary.terrain.slope_deg.value ?? '—'}° · Elev: ${targetPlanetary.terrain.elevation_m.value ?? '—'} m`,
      `Temp Range: ${targetPlanetary.climate.temp_night_c.value ?? '—'} °C to ${targetPlanetary.climate.temp_day_c.value ?? '—'} °C`,
      '',
      analogEarth ? `TOP MATCHED EARTH ANALOG: ${analogEarth.name}` : '',
      analogEarth
        ? `Coordinates: ${analogEarth.lat.toFixed(2)}°, ${analogEarth.lon.toFixed(2)}° · ${analogEarth.region}`
        : '',
      primaryMatch
        ? `Overall 5-Factor Similarity: ${primaryMatch.similarityPct}% (${primaryMatch.confidence} Confidence — ${primaryMatch.confidenceScorePct}%)`
        : '',
      primaryMatch ? `Confidence Rationale: ${primaryMatch.confidenceExplanation}` : '',
      primaryMatch ? `Match Summary: ${primaryMatch.reason}` : '',
      '',
      `WEIGHTS USED (${activePreset} preset):`,
      `- Terrain & Geology: ${Math.round(normW.terrain * 100)}%`,
      `- Climate & Atmosphere: ${Math.round(normW.climate * 100)}%`,
      `- Resources: ${Math.round(normW.resources * 100)}%`,
      `- Operations: ${Math.round(normW.operations * 100)}%`,
      `- Data Quality: ${Math.round(normW.dataQuality * 100)}%`,
      '',
      '5-FACTOR GROUP SCORES:',
      ...(primaryMatch
        ? primaryMatch.groupOrder.map(
            (g) =>
              `- ${g.label} (weight ${g.normalizedWeightPct}%): ${g.scorePct}% [${g.populatedCount}/${g.totalCount} sub-factors scored]`
          )
        : []),
      '',
      'TOP 3 EARTH MATCHES:',
      ...rankedEarthMatches
        .slice(0, 3)
        .map(
          (m, idx) =>
            `#${idx + 1} ${m.earthSite.name}: ${m.similarityPct}% (${m.confidence} confidence)`
        ),
      '',
      analogEarth
        ? `NASA POWER Climatology (${earthPower?.isLive ? 'Live API' : 'Bundled Baseline'}): TMax ${(
            earthPower?.tMaxC ??
            analogEarth.climate.temp_day_c.value ??
            0
          ).toFixed(1)} °C, TMin ${(
            earthPower?.tMinC ??
            analogEarth.climate.temp_night_c.value ??
            0
          ).toFixed(1)} °C, Solar ${(
            earthPower?.sunlightHoursPerDay ??
            analogEarth.resources.sunlight_hours_per_day.value ??
            0
          ).toFixed(1)} hrs/day`
        : '',
      '',
      'DATA SOURCES:',
      ...uniqueSources.map(
        (s) => `- [${s.mode}] ${s.dataset} (${s.source}) · Res: ${s.resolution}`
      ),
      '',
      'MEM Finder · NASA Space Apps Challenge',
    ].filter(Boolean);

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mem-finder-report-${targetPlanetary.id}-to-${analogEarth?.id ?? 'analog'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="print-only-report w-full max-w-4xl rounded-xl border border-slate-700 bg-[#0D1321] p-6 text-slate-100 shadow-2xl my-auto max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700 pb-4">
          <div>
            <div className="font-display text-2xl font-bold tracking-tight">
              <span className="text-[#CBD5E1]">M</span>
              <span className="text-[#38BDF8]">E</span>
              <span className="text-[#F97316]">M</span>
              <span className="ml-1.5">Finder</span>
              <span className="ml-3 text-sm font-normal text-slate-400">
                One-Page Mission Analog Brief
              </span>
            </div>
            <p className="mt-1 text-xs font-mono text-slate-400">
              Moon · Earth · Mars — Find Earth&apos;s twin for every Moon and Mars mission.
            </p>
          </div>

          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadBrief}
              className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Brief</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close report"
              className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Summary Banner */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-500/40 bg-[#080C17] p-4">
          <div>
            <div className="text-xs font-mono uppercase text-cyan-400">
              Matched Mission Pair · {primaryMatch?.confidence ?? 'High'} Confidence (
              {primaryMatch?.confidenceScorePct ?? 0}%)
            </div>
            <div className="mt-0.5 font-display text-lg font-bold">
              {targetPlanetary.name} ({targetPlanetary.world.toUpperCase()}) ⇄{' '}
              {analogEarth?.name ?? '—'} (EARTH)
            </div>
            <p className="mt-1 text-xs text-slate-300">{primaryMatch?.reason}</p>
            {primaryMatch && (
              <p className="mt-1 text-[11px] font-mono text-slate-400">
                {primaryMatch.confidenceExplanation}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="font-mono text-3xl font-bold text-cyan-300">
              {primaryMatch?.similarityPct ?? 0}%
            </div>
            <div className="text-[11px] font-mono text-slate-400">
              Weighted Score ({activePreset})
            </div>
          </div>
        </div>

        {/* Radar Chart + All 5 Group Scores & Weights Used */}
        {primaryMatch && analogEarth && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5 rounded-lg border border-slate-800 bg-[#080C17] p-4 flex flex-col items-center justify-center">
              <div className="text-[11px] font-mono uppercase text-slate-400 mb-1">
                5-Axis Factor Radar Chart
              </div>
              <RadarChartSvg
                primaryGroups={primaryMatch.groups}
                primaryLabel={analogEarth.name.split(',')[0]}
                targetLabel={targetPlanetary.name}
                size={250}
              />
            </div>

            <div className="md:col-span-7 rounded-lg border border-slate-800 bg-[#080C17] p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono uppercase text-slate-400">
                <span>All 5 Factor Group Scores</span>
                <span>Weights Used (Sum 100%)</span>
              </div>

              {primaryMatch.groupOrder.map((g) => (
                <div key={g.key} className="border border-slate-800 rounded p-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span>
                      {g.label}{' '}
                      <span className="font-mono text-[10px] text-orange-300">
                        (weight {g.normalizedWeightPct}%)
                      </span>
                    </span>
                    <span className="font-mono text-cyan-300">
                      {g.scorePct}% ({g.populatedCount}/{g.totalCount} scored)
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-400"
                      style={{ width: `${g.scorePct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Two-column Target vs Earth physical summary */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-[#080C17] p-4 space-y-1.5 text-xs">
            <div className="font-display text-sm font-bold text-orange-400">
              Off-World Target: {targetPlanetary.name}
            </div>
            <div className="font-mono text-slate-400">
              {targetPlanetary.lat.toFixed(2)}°, {targetPlanetary.lon.toFixed(2)}° ·{' '}
              {targetPlanetary.region}
            </div>
            <div className="text-slate-200 capitalize">
              {targetPlanetary.terrain.rock_soil_type.value ?? '—'} ·{' '}
              {targetPlanetary.terrain.slope_deg.value ?? '—'}° slope ·{' '}
              {targetPlanetary.terrain.elevation_m.value?.toLocaleString() ?? '—'} m elev
            </div>
            <div className="font-mono text-slate-200">
              Temp: {targetPlanetary.climate.temp_night_c.value ?? '—'} °C to{' '}
              {targetPlanetary.climate.temp_day_c.value ?? '—'} °C · Comm delay:{' '}
              {targetPlanetary.operations.comm_delay_s.value ?? 0} s
            </div>
          </div>

          {analogEarth && (
            <div className="rounded-lg border border-slate-800 bg-[#080C17] p-4 space-y-1.5 text-xs">
              <div className="font-display text-sm font-bold text-sky-400">
                Earth Analog: {analogEarth.name}
              </div>
              <div className="font-mono text-slate-400">
                {analogEarth.lat.toFixed(2)}°, {analogEarth.lon.toFixed(2)}° ·{' '}
                {analogEarth.region}
              </div>
              <div className="text-slate-200 capitalize">
                {analogEarth.terrain.rock_soil_type.value ?? '—'} ·{' '}
                {analogEarth.terrain.slope_deg.value ?? '—'}° slope ·{' '}
                {analogEarth.terrain.elevation_m.value?.toLocaleString() ?? '—'} m elev
              </div>
              <div className="font-mono text-slate-200">
                POWER ({earthPower?.isLive ? 'Live' : 'Baseline'}):{' '}
                {(earthPower?.tMinC ?? analogEarth.climate.temp_night_c.value ?? 0).toFixed(1)} °C
                to {(earthPower?.tMaxC ?? analogEarth.climate.temp_day_c.value ?? 0).toFixed(1)}{' '}
                °C · Help: {analogEarth.operations.distance_to_help_km.value ?? '—'} km
              </div>
            </div>
          )}
        </div>

        {/* Full Data Sources List */}
        <div className="mt-4 rounded-lg border border-slate-800 bg-[#080C17] p-4">
          <div className="text-xs font-mono uppercase text-slate-400 mb-2">
            Data Sources &amp; Dataset Provenance ({uniqueSources.length} active pairs)
          </div>
          <div className="max-h-40 overflow-y-auto space-y-1.5 text-[11px] font-mono">
            {uniqueSources.map((src) => (
              <div
                key={`${src.dataset}-${src.source}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-1"
              >
                <span className="text-slate-200">
                  <span className="text-cyan-400">[{src.mode}]</span> {src.dataset}
                </span>
                <span className="text-slate-400">
                  {src.source} · {src.resolution}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-slate-800 pt-3 flex flex-wrap justify-between gap-2 text-[11px] font-mono text-slate-400">
          <span>MEM Finder · Moon · Earth · Mars</span>
          <span>NASA Space Apps Challenge</span>
        </div>
      </div>
    </div>
  );
};

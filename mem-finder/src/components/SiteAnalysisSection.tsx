import React, { useState } from 'react';
import { GitCompareArrows, Info, Layers, Radio, ShieldCheck, AlertTriangle } from 'lucide-react';
import type {
  ConfidenceLevel,
  EarthAnalogSite,
  FactorGroupKey,
  MatchResult,
  PlanetarySite,
} from '../types/mem';
import { RadarChartSvg } from './RadarChartSvg';

interface SiteAnalysisSectionProps {
  activeTargetSite: PlanetarySite;
  rankedMatches: MatchResult[];
  earthSites: EarthAnalogSite[];
  selectedEarthSiteId: string;
  onSelectEarthSite: (site: EarthAnalogSite) => void;
  compareMode: boolean;
  onToggleCompareMode: () => void;
  compareSiteBId: string;
  onChangeCompareSiteB: (siteId: string) => void;
  onOpenReport: () => void;
}

const TAB_ORDER: Array<{ key: FactorGroupKey; short: string }> = [
  { key: 'terrain', short: '1. Terrain & Geology' },
  { key: 'climate', short: '2. Climate & Atmosphere' },
  { key: 'resources', short: '3. Resources' },
  { key: 'operations', short: '4. Operations' },
  { key: 'dataQuality', short: '5. Data Quality' },
];

function confidenceStyle(level: ConfidenceLevel): string {
  if (level === 'High') return 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300';
  if (level === 'Medium') return 'border-amber-500/50 bg-amber-500/15 text-amber-300';
  return 'border-rose-500/50 bg-rose-500/15 text-rose-300';
}

export const ConfidenceTooltipBadge: React.FC<{
  level: ConfidenceLevel;
  scorePct: number;
  explanation: string;
}> = ({ level, scorePct, explanation }) => (
  <span className="group relative inline-flex items-center">
    <span
      tabIndex={0}
      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-mono font-semibold cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${confidenceStyle(
        level
      )}`}
    >
      <ShieldCheck className="w-3.5 h-3.5" />
      <span>
        {level} Confidence ({scorePct}%)
      </span>
      <Info className="w-3 h-3 opacity-75" />
    </span>
    <span
      role="tooltip"
      className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute right-0 top-full z-30 mt-2 w-72 rounded-lg border border-slate-700 bg-[#070B14] p-3 text-[11px] font-sans font-normal leading-relaxed text-slate-200 shadow-2xl"
    >
      <span className="block font-mono text-[10px] uppercase tracking-wider text-cyan-400 mb-1">
        Data Quality Rationale
      </span>
      {explanation}
    </span>
  </span>
);

export const SiteAnalysisSection: React.FC<SiteAnalysisSectionProps> = ({
  activeTargetSite,
  rankedMatches,
  earthSites,
  selectedEarthSiteId,
  onSelectEarthSite,
  compareMode,
  onToggleCompareMode,
  compareSiteBId,
  onChangeCompareSiteB,
  onOpenReport,
}) => {
  const [activeTab, setActiveTab] = useState<FactorGroupKey>('terrain');

  const primaryMatch =
    rankedMatches.find((m) => m.earthSite.id === selectedEarthSiteId) ?? rankedMatches[0];
  const secondaryMatch =
    rankedMatches.find((m) => m.earthSite.id === compareSiteBId) ??
    rankedMatches.find((m) => m.earthSite.id !== primaryMatch?.earthSite.id) ??
    rankedMatches[1];

  if (!primaryMatch) return null;

  const activeGroup = primaryMatch.groups[activeTab];
  const compareGroup = compareMode && secondaryMatch ? secondaryMatch.groups[activeTab] : null;

  return (
    <section
      id="analysis"
      className="mx-auto max-w-[1280px] px-5 pt-4 pb-12 md:px-8"
    >
      {/* Header + Earth Site Picker + Compare Mode Toggle */}
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-cyan-400">
            02B. Sub-Factor Site Analysis &amp; Radar
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-100 md:text-3xl">
            Site Analysis: {primaryMatch.earthSite.name} ⇄ {activeTargetSite.name}
          </h2>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">
            Inspect every normalized sub-factor across all 5 groups with live dataset badges, missing-value transparency, and side-by-side Earth analog comparison.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Primary Earth Site selector */}
          <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0D1321] px-3 py-1.5 text-xs">
            <span className="font-mono text-sky-400">Site A:</span>
            <select
              value={primaryMatch.earthSite.id}
              onChange={(e) => {
                const found = earthSites.find((s) => s.id === e.target.value);
                if (found) onSelectEarthSite(found);
              }}
              aria-label="Select primary Earth analog site"
              className="bg-transparent font-medium text-white focus:outline-none cursor-pointer"
            >
              {rankedMatches.map((m, idx) => (
                <option key={m.earthSite.id} value={m.earthSite.id} className="bg-[#0D1321]">
                  #{idx + 1} {m.earthSite.name} ({m.similarityPct}%)
                </option>
              ))}
            </select>
          </label>

          {/* Compare Mode toggle */}
          <button
            type="button"
            onClick={onToggleCompareMode}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              compareMode
                ? 'border-orange-400 bg-orange-500/20 text-orange-200'
                : 'border-slate-700 bg-[#0D1321] text-slate-300 hover:border-slate-500'
            }`}
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            <span>{compareMode ? 'Compare Mode: ON' : 'Compare 2 Earth Sites'}</span>
          </button>

          {/* Secondary Earth Site selector when Compare Mode is ON */}
          {compareMode && secondaryMatch && (
            <label className="flex items-center gap-2 rounded-lg border border-orange-500/60 bg-[#0D1321] px-3 py-1.5 text-xs">
              <span className="font-mono text-orange-400">Site B:</span>
              <select
                value={secondaryMatch.earthSite.id}
                onChange={(e) => onChangeCompareSiteB(e.target.value)}
                aria-label="Select second Earth analog site for comparison"
                className="bg-transparent font-medium text-white focus:outline-none cursor-pointer"
              >
                {rankedMatches.map((m, idx) => (
                  <option key={m.earthSite.id} value={m.earthSite.id} className="bg-[#0D1321]">
                    #{idx + 1} {m.earthSite.name} ({m.similarityPct}%)
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* Main Grid: Left = 5-Axis Radar Chart + Compare Delta; Right = 5 Factor Group Tabs + Sub-Factor Table */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: 5-Axis Radar Chart + Overall Verdict */}
        <div className="lg:col-span-5 rounded-xl border border-slate-800 bg-[#0D1321] p-5 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                  5-Axis Factor Profile
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-bold text-white">
                    {primaryMatch.similarityPct}%
                  </span>
                  {compareMode && secondaryMatch && (
                    <span className="font-mono text-sm text-orange-300">
                      vs {secondaryMatch.similarityPct}% ({secondaryMatch.earthSite.name.split(',')[0]})
                    </span>
                  )}
                </div>
              </div>

              <ConfidenceTooltipBadge
                level={primaryMatch.confidence}
                scorePct={primaryMatch.confidenceScorePct}
                explanation={primaryMatch.confidenceExplanation}
              />
            </div>

            <div className="mt-4 flex justify-center">
              <RadarChartSvg
                primaryGroups={primaryMatch.groups}
                primaryLabel={primaryMatch.earthSite.name.split(',')[0]}
                targetLabel={activeTargetSite.name}
                secondaryGroups={compareMode && secondaryMatch ? secondaryMatch.groups : undefined}
                secondaryLabel={
                  compareMode && secondaryMatch
                    ? secondaryMatch.earthSite.name.split(',')[0]
                    : undefined
                }
              />
            </div>
          </div>

          {/* Side-by-Side 5-Group Summary (or Single-Site Group Scorecard) */}
          <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between text-[11px] font-mono uppercase text-slate-400">
              <span>Group Scorecards</span>
              <span>
                {compareMode && secondaryMatch ? 'Site A vs Site B' : 'Weight · Score'}
              </span>
            </div>

            {primaryMatch.groupOrder.map((grp) => {
              const secGrp =
                compareMode && secondaryMatch ? secondaryMatch.groups[grp.key] : null;
              const delta = secGrp ? grp.scorePct - secGrp.scorePct : null;

              return (
                <button
                  key={grp.key}
                  type="button"
                  onClick={() => setActiveTab(grp.key)}
                  className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors cursor-pointer ${
                    activeTab === grp.key
                      ? 'border-cyan-400/70 bg-cyan-500/10'
                      : 'border-slate-800 bg-[#080C17] hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-100">{grp.label}</span>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-[10px] text-slate-400">
                        w {grp.normalizedWeightPct}%
                      </span>
                      <span className="font-bold text-cyan-300">{grp.scorePct}%</span>
                      {secGrp && (
                        <>
                          <span className="text-slate-500">vs</span>
                          <span className="font-bold text-orange-300">{secGrp.scorePct}%</span>
                          <span
                            className={`text-[10px] ${
                              (delta ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {(delta ?? 0) >= 0 ? `+${delta}` : delta}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

            {compareMode && secondaryMatch && (
              <div className="mt-2 rounded-lg border border-slate-800 bg-[#080C17] p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-orange-300">
                    Site B: {secondaryMatch.earthSite.name}
                  </span>
                  <ConfidenceTooltipBadge
                    level={secondaryMatch.confidence}
                    scorePct={secondaryMatch.confidenceScorePct}
                    explanation={secondaryMatch.confidenceExplanation}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">{secondaryMatch.reason}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right: 5 Tabs (one per factor group) listing every sub-factor */}
        <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-[#0D1321] p-5 flex flex-col justify-between">
          <div>
            {/* 5 Factor Group Tabs */}
            <div
              role="tablist"
              aria-label="Factor group sub-factor tabs"
              className="flex flex-wrap gap-1.5 border-b border-slate-800 pb-3"
            >
              {TAB_ORDER.map((tab) => {
                const grp = primaryMatch.groups[tab.key];
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    role="tab"
                    type="button"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.key)}
                    className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      isActive
                        ? 'border-cyan-400 bg-cyan-500/20 text-white font-semibold'
                        : 'border-slate-800 bg-[#080C17] text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <span>{tab.short}</span>
                    <span className="ml-1.5 font-mono text-[11px] text-cyan-300">
                      {grp.scorePct}%
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active Group Summary Strip */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-300">
                <span className="font-semibold text-white">{activeGroup.label}</span>{' '}
                <span className="font-mono text-slate-400">
                  ({activeGroup.populatedCount}/{activeGroup.totalCount} sub-factors scored ·{' '}
                  weight {activeGroup.normalizedWeightPct}%)
                </span>
              </div>
              <div className="font-mono text-xs text-cyan-300">
                Formula: avg(1 − |earth_norm − target_norm|)
              </div>
            </div>

            {/* Sub-Factor Rows */}
            <div className="mt-3 space-y-2.5">
              {activeGroup.subFactors.map((sf, idx) => {
                const secSf = compareGroup?.subFactors[idx];

                return (
                  <div
                    key={sf.id}
                    className={`rounded-lg border p-3.5 ${
                      sf.skipped
                        ? 'border-amber-500/40 bg-amber-950/15'
                        : 'border-slate-800 bg-[#080C17]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{sf.label}</span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {sf.id}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Live vs Pre-processed badge */}
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                            sf.mode === 'live'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {sf.mode === 'live' ? (
                            <Radio className="w-2.5 h-2.5" />
                          ) : (
                            <Layers className="w-2.5 h-2.5" />
                          )}
                          <span>{sf.mode === 'live' ? 'Live' : 'Pre-processed'}</span>
                        </span>

                        {sf.skipped ? (
                          <span className="inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Skipped</span>
                          </span>
                        ) : (
                          <span className="font-mono text-sm font-bold text-cyan-300">
                            {sf.similarityPct}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Earth Value vs Target Value (+ Site B if Compare Mode is ON) */}
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
                      <div className="rounded border border-slate-800/80 bg-[#050811] px-2.5 py-1.5">
                        <span className="font-mono text-[10px] uppercase text-sky-400 block">
                          Earth ({primaryMatch.earthSite.name.split(',')[0]})
                        </span>
                        <span
                          className={`font-mono ${
                            sf.skipped ? 'text-amber-300' : 'text-slate-100'
                          }`}
                        >
                          {sf.earthDisplay}
                        </span>
                      </div>

                      <div className="rounded border border-slate-800/80 bg-[#050811] px-2.5 py-1.5">
                        <span className="font-mono text-[10px] uppercase text-orange-400 block">
                          Target ({activeTargetSite.name})
                        </span>
                        <span className="font-mono text-slate-100">{sf.targetDisplay}</span>
                      </div>
                    </div>

                    {compareMode && secSf && (
                      <div className="mt-2 flex items-center justify-between rounded border border-orange-500/30 bg-orange-950/15 px-2.5 py-1.5 text-xs">
                        <span className="font-mono text-orange-300">
                          Site B ({secondaryMatch?.earthSite.name.split(',')[0]}):{' '}
                          <span className="text-white">{secSf.earthDisplay}</span>
                        </span>
                        <span className="font-mono font-bold text-orange-300">
                          {secSf.skipped ? 'Skipped' : `${secSf.similarityPct}% match`}
                        </span>
                      </div>
                    )}

                    {/* Match Bar */}
                    {!sf.skipped ? (
                      <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className={`h-full transition-all duration-200 ${
                            (sf.similarityPct ?? 0) >= 75
                              ? 'bg-emerald-400'
                              : (sf.similarityPct ?? 0) >= 55
                                ? 'bg-cyan-400'
                                : 'bg-amber-400'
                          }`}
                          style={{ width: `${sf.similarityPct ?? 0}%` }}
                        />
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] font-mono text-amber-300">
                        {sf.skipReason} — weights re-normalized across populated sub-factors.
                      </div>
                    )}

                    {/* Dataset + Resolution provenance */}
                    <div className="mt-2 text-[10px] font-mono text-slate-400 leading-relaxed">
                      Dataset: <span className="text-cyan-300/90">{sf.dataset}</span> · Source:{' '}
                      {sf.source} · Res: {sf.resolution}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-mono text-slate-400">
              {primaryMatch.missingCount > 0
                ? `${primaryMatch.missingCount} missing field skipped · Data Quality adjusted to ${primaryMatch.confidenceScorePct}%`
                : '0 missing sub-factors across all 5 groups'}
            </span>
            <button
              type="button"
              onClick={onOpenReport}
              className="font-mono text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
            >
              Include Radar &amp; 5-Group Scorecard in Export Report →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

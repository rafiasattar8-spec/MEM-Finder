/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import moonSitesRaw from '../data/moon_sites.json';
import marsSitesRaw from '../data/mars_sites.json';
import earthAnalogsRaw from '../data/earth_analogs.json';
import type {
  AnySite,
  EarthAnalogSite,
  EarthLayerId,
  FactorWeights,
  PlanetarySite,
  PowerClimatology,
  SimTargetParams,
  WeightPresetId,
} from './types/mem';
import {
  computeDatasetBounds,
  DEFAULT_FACTOR_WEIGHTS,
  findBestPlanetaryTargetForEarth,
  rankEarthMatchesForTarget,
  siteToTargetParams,
  WEIGHT_PRESETS,
} from './utils/similarityEngine';
import { fetchNasaPowerClimatology } from './utils/nasaApis';
import { LoadingScreen } from './components/LoadingScreen';
import { Navbar } from './components/Navbar';
import { ThreeWorldsSection } from './components/ThreeWorldsSection';
import { SiteAnalysisSection } from './components/SiteAnalysisSection';
import { MemSimulator } from './components/MemSimulator';
import { SourcesSection } from './components/SourcesSection';
import { GuidedTourOverlay, TOUR_STEPS } from './components/GuidedTourOverlay';
import { ReportModal } from './components/ReportModal';

const moonSites = moonSitesRaw as PlanetarySite[];
const marsSites = marsSitesRaw as PlanetarySite[];
const earthSites = earthAnalogsRaw as EarthAnalogSite[];
const planetarySites: PlanetarySite[] = [...marsSites, ...moonSites];

export default function App() {
  const [sceneReady, setSceneReady] = useState(false);
  const [loaderVisible, setLoaderVisible] = useState(true);

  useEffect(() => {
    if (!sceneReady) return;
    const t = window.setTimeout(() => setLoaderVisible(false), 650);
    return () => window.clearTimeout(t);
  }, [sceneReady]);

  // Dynamic dataset min/max bounds across all 21 sites for sub-factor normalization
  const datasetBounds = useMemo(
    () => computeDatasetBounds([...moonSites, ...marsSites, ...earthSites]),
    []
  );

  // Active Moon/Mars target (defaults to Gale Crater -> Kharan Desert twin)
  const defaultTargetSite = marsSites[1] ?? marsSites[0];
  const [selectedSite, setSelectedSite] = useState<AnySite>(defaultTargetSite);
  const [activeTargetSite, setActiveTargetSite] =
    useState<PlanetarySite>(defaultTargetSite);

  // Selected Earth site in Site Analysis & Compare Mode state
  const [inspectedEarthSiteId, setInspectedEarthSiteId] = useState<string>(
    defaultTargetSite.seededAnalogId
  );
  const [compareMode, setCompareMode] = useState(false);
  const [compareSiteBId, setCompareSiteBId] = useState<string>('pinacate');

  // Earth GIBS layer + Similarity Heatmap toggle
  const [earthLayer, setEarthLayer] = useState<EarthLayerId>('blue-marble');
  const [similarityHeatmap, setSimilarityHeatmap] = useState(false);

  // Live NASA POWER climatology cache keyed by Earth analog ID
  const [powerCache, setPowerCache] = useState<Record<string, PowerClimatology>>({});
  const [powerLoadingId, setPowerLoadingId] = useState<string | null>(null);

  // 5-Factor Scoring Weights (30/25/20/15/10 Balanced default) + Presets + Simulator overrides
  const [activeWeightPreset, setActiveWeightPreset] = useState<
    WeightPresetId | 'custom'
  >('balanced');
  const [factorWeights, setFactorWeights] =
    useState<FactorWeights>(DEFAULT_FACTOR_WEIGHTS);
  const [simTarget, setSimTarget] = useState<SimTargetParams>(() =>
    siteToTargetParams(defaultTargetSite)
  );

  // Guided tour & report modal state
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);

  const ensurePowerData = useCallback(
    async (earthSite: EarthAnalogSite) => {
      if (powerCache[earthSite.id]) return;
      setPowerLoadingId(earthSite.id);
      const data = await fetchNasaPowerClimatology(earthSite);
      setPowerCache((prev) => ({ ...prev, [earthSite.id]: data }));
      setPowerLoadingId((curr) => (curr === earthSite.id ? null : curr));
    },
    [powerCache]
  );

  // Rank all 10 Earth sites against the active Moon/Mars target using the 20-sub-factor model
  const rankedEarthMatches = useMemo(
    () =>
      rankEarthMatchesForTarget(
        activeTargetSite,
        earthSites,
        factorWeights,
        datasetBounds,
        powerCache,
        simTarget
      ),
    [activeTargetSite, factorWeights, datasetBounds, powerCache, simTarget]
  );

  // Keep Site B distinct from Site A automatically if needed
  useEffect(() => {
    if (compareSiteBId === inspectedEarthSiteId) {
      const fallback = rankedEarthMatches.find(
        (m) => m.earthSite.id !== inspectedEarthSiteId
      );
      if (fallback) setCompareSiteBId(fallback.earthSite.id);
    }
  }, [compareSiteBId, inspectedEarthSiteId, rankedEarthMatches]);

  // Reverse match when an Earth site is selected directly
  const bestPlanetaryMatch = useMemo(() => {
    if (selectedSite.world !== 'earth') return null;
    return findBestPlanetaryTargetForEarth(
      selectedSite as EarthAnalogSite,
      planetarySites,
      factorWeights,
      datasetBounds,
      powerCache
    );
  }, [selectedSite, factorWeights, datasetBounds, powerCache]);

  // Fetch live NASA POWER API for the active Earth site (clicked, inspected, or #1 match)
  useEffect(() => {
    const earthTarget =
      selectedSite.world === 'earth'
        ? (selectedSite as EarthAnalogSite)
        : earthSites.find((s) => s.id === inspectedEarthSiteId) ??
          rankedEarthMatches[0]?.earthSite;

    if (earthTarget) {
      ensurePowerData(earthTarget);
    }
  }, [selectedSite, inspectedEarthSiteId, rankedEarthMatches, ensurePowerData]);

  const handleSelectSite = useCallback((site: AnySite) => {
    setSelectedSite(site);
    if (site.world !== 'earth') {
      const pSite = site as PlanetarySite;
      setActiveTargetSite(pSite);
      setSimTarget(siteToTargetParams(pSite));
      setInspectedEarthSiteId(pSite.seededAnalogId);
    } else {
      setInspectedEarthSiteId(site.id);
    }
  }, []);

  const handleSelectEarthForAnalysis = useCallback((earthSite: EarthAnalogSite) => {
    setInspectedEarthSiteId(earthSite.id);
    setSelectedSite(earthSite);
    const el = document.getElementById('analysis');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleOpenInSimulator = useCallback((site: PlanetarySite) => {
    setActiveTargetSite(site);
    setSimTarget(siteToTargetParams(site));
    const el = document.getElementById('simulator');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleApplyWeightPreset = useCallback((presetId: WeightPresetId) => {
    setActiveWeightPreset(presetId);
    setFactorWeights(WEIGHT_PRESETS[presetId].weights);
  }, []);

  const handleChangeWeights = useCallback((next: FactorWeights) => {
    setActiveWeightPreset('custom');
    setFactorWeights(next);
  }, []);

  const handleResetSimulator = useCallback(() => {
    setSimTarget(siteToTargetParams(activeTargetSite));
    setActiveWeightPreset('balanced');
    setFactorWeights(DEFAULT_FACTOR_WEIGHTS);
  }, [activeTargetSite]);

  // Tour orchestration
  const handleStartTour = () => {
    setTourStep(0);
    setTourActive(true);
    handleSelectSite(marsSites[0]); // Acidalia Planitia -> Hingol
  };

  useEffect(() => {
    if (!tourActive) return;
    if (tourStep === 1) {
      handleSelectSite(moonSites[2]); // Mare Tranquillitatis Pit -> Mount Suswa
    } else if (tourStep === 2) {
      setSimilarityHeatmap(true);
      setEarthLayer('modis-lst');
    } else if (tourStep === 3) {
      setSimilarityHeatmap(false);
      setEarthLayer('blue-marble');
    }
  }, [tourActive, tourStep, handleSelectSite]);

  const currentTourHighlight = tourActive
    ? TOUR_STEPS[tourStep]?.highlightKey ?? null
    : null;

  const simulatorWinnerId = rankedEarthMatches[0]?.earthSite.id ?? null;

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 hud-grid-bg">
      <LoadingScreen visible={loaderVisible} />

      <Navbar onStartTour={handleStartTour} tourActive={tourActive} />

      <main>
        {/* SECTION 1: Hero */}
        <section
          id="hero"
          className="relative mx-auto max-w-[1280px] px-5 pt-14 pb-10 md:px-8 md:pt-20 md:pb-12"
        >
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-3 text-xs font-mono tracking-wider text-slate-400">
              <span className="font-display font-bold text-sm tracking-tight">
                <span className="text-[#CBD5E1]">M</span>
                <span className="text-[#38BDF8]">E</span>
                <span className="text-[#F97316]">M</span>
                <span className="ml-1.5 text-slate-200">Finder</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>Moon · Earth · Mars</span>
            </div>

            <h1 className="mt-4 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl text-balance">
              Three worlds. One match.
            </h1>

            <p className="mt-4 text-lg font-medium text-cyan-300 md:text-xl">
              Find Earth&apos;s twin for every Moon and Mars mission.
            </p>

            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
              Scoring 10 Earth analog sites against 11 Moon and Mars targets across 5 factor groups and 20+ open-agency sub-factors from NASA PDS, SRTM/Copernicus DEM, USGS, and live NASA POWER climatology.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a
                href="#worlds"
                className="inline-flex items-center gap-2 rounded-md bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
              >
                <span>Explore the worlds</span>
                <ArrowDown className="w-4 h-4" />
              </a>
            </div>
          </div>
        </section>

        {/* SECTION 2 & 3: 3D Globes + 21 Clickable Sites + Top-3 Arcs + Similarity Heatmap */}
        <ThreeWorldsSection
          moonSites={moonSites}
          marsSites={marsSites}
          earthSites={earthSites}
          selectedSite={selectedSite}
          activeTargetSite={activeTargetSite}
          onSelectSite={handleSelectSite}
          rankedEarthMatches={rankedEarthMatches}
          bestPlanetaryMatch={bestPlanetaryMatch}
          simulatorWinningEarthId={simulatorWinnerId}
          earthLayer={earthLayer}
          onChangeEarthLayer={setEarthLayer}
          similarityHeatmap={similarityHeatmap}
          onToggleSimilarityHeatmap={() => setSimilarityHeatmap((v) => !v)}
          powerCache={powerCache}
          powerLoadingId={powerLoadingId}
          onOpenInSimulator={handleOpenInSimulator}
          onOpenReport={() => setReportOpen(true)}
          onSceneReady={() => setSceneReady(true)}
          highlightedForTour={
            currentTourHighlight === 'worlds' ||
            currentTourHighlight === 'sites' ||
            currentTourHighlight === 'layers'
              ? currentTourHighlight
              : null
          }
        />

        {/* SECTION 2B: Full 5-Tab Site Analysis, 5-Axis Radar Chart & Compare Mode */}
        <SiteAnalysisSection
          activeTargetSite={activeTargetSite}
          rankedMatches={rankedEarthMatches}
          earthSites={earthSites}
          selectedEarthSiteId={inspectedEarthSiteId}
          onSelectEarthSite={(site) => {
            setInspectedEarthSiteId(site.id);
            setSelectedSite(site);
          }}
          compareMode={compareMode}
          onToggleCompareMode={() => setCompareMode((v) => !v)}
          compareSiteBId={compareSiteBId}
          onChangeCompareSiteB={setCompareSiteBId}
          onOpenReport={() => setReportOpen(true)}
        />

        {/* SECTION 4: Weight Presets, 10-Site Leaderboard (5 Mini Bars) & 60fps MEM Simulator */}
        <MemSimulator
          activeTargetSite={activeTargetSite}
          targetParams={simTarget}
          onChangeTarget={setSimTarget}
          weights={factorWeights}
          activePreset={activeWeightPreset}
          onApplyWeightPreset={handleApplyWeightPreset}
          onChangeWeights={handleChangeWeights}
          rankedMatches={rankedEarthMatches}
          presetSites={planetarySites}
          onApplyPreset={(site) => handleSelectSite(site)}
          onSelectEarthForAnalysis={handleSelectEarthForAnalysis}
          onResetSimulator={handleResetSimulator}
          highlightedForTour={currentTourHighlight === 'simulator'}
        />

        {/* SECTION 5 & 6: Data & Sources + Why This Matters + Footer */}
        <SourcesSection />
      </main>

      <GuidedTourOverlay
        active={tourActive}
        stepIndex={tourStep}
        onChangeStep={setTourStep}
        onClose={() => setTourActive(false)}
      />

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        selectedSite={selectedSite}
        activeTargetSite={activeTargetSite}
        rankedEarthMatches={rankedEarthMatches}
        bestPlanetaryMatch={bestPlanetaryMatch}
        weights={factorWeights}
        activePreset={activeWeightPreset}
        powerCache={powerCache}
      />
    </div>
  );
}

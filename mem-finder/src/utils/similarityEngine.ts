import type {
  ConfidenceLevel,
  DataMode,
  EarthAnalogSite,
  FactorGroupKey,
  FactorGroupResult,
  FactorWeights,
  MatchResult,
  PlanetarySite,
  PowerClimatology,
  ReverseMatchResult,
  SimTargetParams,
  SubFactorEvaluation,
  SubFactorField,
  WeightPresetId,
} from '../types/mem';

/**
 * Default 5-factor weights from the MEM Finder mission-analog rubric:
 *   1. Terrain & geology     = 30%
 *   2. Climate & atmosphere  = 25%
 *   3. Resources             = 20%
 *   4. Operations            = 15%
 *   5. Data quality          = 10%
 */
export const DEFAULT_FACTOR_WEIGHTS: FactorWeights = {
  terrain: 30,
  climate: 25,
  resources: 20,
  operations: 15,
  dataQuality: 10,
};

export interface WeightPresetMeta {
  id: WeightPresetId;
  label: string;
  description: string;
  weights: FactorWeights;
}

export const WEIGHT_PRESETS: Record<WeightPresetId, WeightPresetMeta> = {
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    description: 'Default 30 / 25 / 20 / 15 / 10 scientific baseline',
    weights: { terrain: 30, climate: 25, resources: 20, operations: 15, dataQuality: 10 },
  },
  'terrain-heavy': {
    id: 'terrain-heavy',
    label: 'Terrain-heavy',
    description: 'Prioritizes geology, slope & crater geometry (50 / 15 / 15 / 10 / 10)',
    weights: { terrain: 50, climate: 15, resources: 15, operations: 10, dataQuality: 10 },
  },
  'base-building': {
    id: 'base-building',
    label: 'Base-building',
    description: 'Focuses on ISRU resources + mission operations (15 / 15 / 35 / 25 / 10)',
    weights: { terrain: 15, climate: 15, resources: 35, operations: 25, dataQuality: 10 },
  },
  training: {
    id: 'training',
    label: 'Training',
    description: 'Optimizes EVA terrain fidelity + field logistics (35 / 15 / 10 / 30 / 10)',
    weights: { terrain: 35, climate: 15, resources: 10, operations: 30, dataQuality: 10 },
  },
};

export const FACTOR_GROUP_LABELS: Record<FactorGroupKey, string> = {
  terrain: 'Terrain & Geology',
  climate: 'Climate & Atmosphere',
  resources: 'Resources',
  operations: 'Operations',
  dataQuality: 'Data Quality',
};

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Checks whether a sub-factor field has a missing / TODO placeholder value.
 * Rule: never invent a number — skip missing sub-factors and lower Data Quality.
 */
export function isMissingValue(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string') {
    const trimmed = val.trim().toLowerCase();
    return trimmed === '' || trimmed.includes('todo real value');
  }
  if (Array.isArray(val)) {
    return val.length === 0;
  }
  if (typeof val === 'number') {
    return !Number.isFinite(val);
  }
  return false;
}

/**
 * Normalizes the 5 group weights so they ALWAYS sum to 100% (1.0).
 */
export function normalizeFactorWeights(weights: FactorWeights): FactorWeights {
  const t = Math.max(0, weights.terrain);
  const c = Math.max(0, weights.climate);
  const r = Math.max(0, weights.resources);
  const o = Math.max(0, weights.operations);
  const d = Math.max(0, weights.dataQuality);
  const sum = t + c + r + o + d;

  if (sum <= 0.0001) {
    return {
      terrain: 0.3,
      climate: 0.25,
      resources: 0.2,
      operations: 0.15,
      dataQuality: 0.1,
    };
  }

  return {
    terrain: t / sum,
    climate: c / sum,
    resources: r / sum,
    operations: o / sum,
    dataQuality: d / sum,
  };
}

/**
 * Similarity lookup table for `rock_soil_type` (0.0 to 1.0).
 * Categories: basalt, volcanic ash, iron-rich dust, evaporite salt, ultramafic,
 * plus mudstone badlands and lunar highland anorthosite.
 */
const ROCK_SOIL_SIMILARITY: Record<string, Record<string, number>> = {
  basalt: {
    basalt: 1.0,
    'volcanic ash': 0.72,
    ultramafic: 0.62,
    anorthosite: 0.66,
    'iron-rich dust': 0.45,
    'mudstone badlands': 0.28,
    'evaporite salt': 0.2,
  },
  'volcanic ash': {
    'volcanic ash': 1.0,
    basalt: 0.72,
    'iron-rich dust': 0.56,
    anorthosite: 0.5,
    ultramafic: 0.44,
    'mudstone badlands': 0.38,
    'evaporite salt': 0.25,
  },
  'iron-rich dust': {
    'iron-rich dust': 1.0,
    'volcanic ash': 0.56,
    'mudstone badlands': 0.64,
    basalt: 0.45,
    'evaporite salt': 0.52,
    ultramafic: 0.42,
    anorthosite: 0.25,
  },
  'evaporite salt': {
    'evaporite salt': 1.0,
    'mudstone badlands': 0.58,
    'iron-rich dust': 0.52,
    'volcanic ash': 0.25,
    ultramafic: 0.24,
    basalt: 0.2,
    anorthosite: 0.18,
  },
  ultramafic: {
    ultramafic: 1.0,
    basalt: 0.62,
    anorthosite: 0.54,
    'volcanic ash': 0.44,
    'iron-rich dust': 0.42,
    'mudstone badlands': 0.3,
    'evaporite salt': 0.24,
  },
  'mudstone badlands': {
    'mudstone badlands': 1.0,
    'iron-rich dust': 0.64,
    'evaporite salt': 0.58,
    'volcanic ash': 0.38,
    ultramafic: 0.3,
    basalt: 0.28,
    anorthosite: 0.18,
  },
  anorthosite: {
    anorthosite: 1.0,
    basalt: 0.66,
    ultramafic: 0.54,
    'volcanic ash': 0.5,
    'iron-rich dust': 0.25,
    'mudstone badlands': 0.18,
    'evaporite salt': 0.18,
  },
};

function lookupRockSoilSimilarity(a: string, b: string): number {
  const ka = a.trim().toLowerCase();
  const kb = b.trim().toLowerCase();
  if (ka === kb) return 1.0;
  return ROCK_SOIL_SIMILARITY[ka]?.[kb] ?? ROCK_SOIL_SIMILARITY[kb]?.[ka] ?? 0.3;
}

/**
 * Ordinal tier mappings for categorical environmental tiers.
 */
const DUST_TIER_MAP: Record<string, number> = {
  low: 0.15,
  medium: 0.55,
  high: 0.95,
};

const WATER_ICE_TIER_MAP: Record<string, number> = {
  none: 0.0,
  trace: 0.33,
  likely: 0.67,
  confirmed: 1.0,
};

/**
 * Computes normalized similarity [0, 1] between two tag arrays (e.g. landforms or minerals)
 * using Dice/overlap coefficient so partial & exact domain matches scale smoothly.
 */
function tagArraySimilarity(tagsA: string[], tagsB: string[]): number {
  const norm = (s: string) => s.trim().toLowerCase();
  const setA = new Set(tagsA.map(norm));
  const setB = new Set(tagsB.map(norm));
  if (setA.size === 0 || setB.size === 0) return 0;

  let exactMatches = 0;
  let partialCredit = 0;

  setA.forEach((a) => {
    if (setB.has(a)) {
      exactMatches += 1;
    } else {
      // Check shared root words (e.g. "phyllosilicate clay" vs "hydrated clay")
      const wordsA = a.split(/[\s-]+/).filter((w) => w.length > 3);
      for (const b of setB) {
        const wordsB = b.split(/[\s-]+/).filter((w) => w.length > 3);
        if (wordsA.some((w) => wordsB.includes(w))) {
          partialCredit += 0.45;
          break;
        }
      }
    }
  });

  const denom = Math.max(setA.size, setB.size);
  return clamp01((exactMatches + partialCredit) / denom);
}

/**
 * Min/max bounds across the full 21-site dataset for every numeric sub-factor.
 * Used to normalize every numeric sub-factor to [0, 1] before applying:
 *   similarity = 1 - |earth_norm - target_norm|
 */
export interface DatasetBounds {
  min: Record<string, number>;
  max: Record<string, number>;
}

const LOG_SCALED_KEYS = new Set([
  'distance_to_help_km',
  'comm_delay_s',
  'dataset_resolution_m',
]);

function transformNumeric(key: string, val: number): number {
  if (LOG_SCALED_KEYS.has(key)) {
    return Math.log10(Math.max(0, val) + 1);
  }
  return val;
}

export function computeDatasetBounds(
  allSites: Array<PlanetarySite | EarthAnalogSite>
): DatasetBounds {
  const min: Record<string, number> = {};
  const max: Record<string, number> = {};

  const recordVal = (key: string, raw: number | null) => {
    if (raw === null || !Number.isFinite(raw)) return;
    const v = transformNumeric(key, raw);
    if (min[key] === undefined || v < min[key]) min[key] = v;
    if (max[key] === undefined || v > max[key]) max[key] = v;
  };

  for (const s of allSites) {
    recordVal('slope_deg', s.terrain.slope_deg.value);
    recordVal('roughness_index', s.terrain.roughness_index.value);
    recordVal('rock_abundance_pct', s.terrain.rock_abundance_pct.value);
    recordVal('crater_boulder_density', s.terrain.crater_boulder_density.value);
    recordVal('elevation_m', s.terrain.elevation_m.value);

    recordVal('temp_day_c', s.climate.temp_day_c.value);
    recordVal('temp_night_c', s.climate.temp_night_c.value);
    recordVal('temp_swing_c', s.climate.temp_swing_c.value);
    recordVal('air_pressure_kpa', s.climate.air_pressure_kpa.value);
    recordVal('humidity_pct', s.climate.humidity_pct.value);
    recordVal('wind_speed_ms', s.climate.wind_speed_ms.value);
    recordVal('radiation_proxy', s.climate.radiation_proxy.value);

    recordVal('sunlight_hours_per_day', s.resources.sunlight_hours_per_day.value);

    recordVal('distance_to_help_km', s.operations.distance_to_help_km.value);
    recordVal('comm_delay_s', s.operations.comm_delay_s.value);
    recordVal('terrain_visibility', s.operations.terrain_visibility.value);
    recordVal('hazard_score', s.operations.hazard_score.value);

    recordVal('dataset_resolution_m', s.data_quality.dataset_resolution_m.value);
    recordVal('coverage', s.data_quality.coverage.value);
  }

  return { min, max };
}

/**
 * Normalizes a single numeric value to [0, 1] using the dataset's min/max bounds.
 */
function normalize01(key: string, val: number, bounds: DatasetBounds): number {
  const lo = bounds.min[key];
  const hi = bounds.max[key];
  if (lo === undefined || hi === undefined || hi - lo < 1e-9) return 0.5;
  const transformed = transformNumeric(key, val);
  return clamp01((transformed - lo) / (hi - lo));
}

function formatNum(val: number, unit?: string): string {
  const rounded =
    Math.abs(val) >= 1000
      ? Math.round(val).toLocaleString()
      : Math.abs(val) >= 10
        ? Number(val.toFixed(1)).toString()
        : Number(val.toFixed(2)).toString();
  return unit && unit !== '0-1' && unit !== 'scalar' ? `${rounded} ${unit}` : rounded;
}

/**
 * Evaluates a numeric sub-factor following the exact MEM Finder rubric:
 *   1. If either Earth or Target value is missing (null / "TODO real value"), skip cleanly.
 *   2. Normalize both values to 0-1 using dataset min/max.
 *   3. Similarity = 1 - |earth_norm - target_norm|.
 */
function evalNumericSubFactor(
  id: string,
  label: string,
  group: FactorGroupKey,
  earthField: SubFactorField<number | null>,
  targetField: SubFactorField<number | null>,
  bounds: DatasetBounds,
  earthOverride?: { value: number; mode?: DataMode; dataset?: string; source?: string; resolution?: string },
  targetOverrideValue?: number
): SubFactorEvaluation {
  const earthRaw = earthOverride ? earthOverride.value : earthField.value;
  const targetRaw = targetOverrideValue !== undefined ? targetOverrideValue : targetField.value;

  const earthMissing = isMissingValue(earthRaw);
  const targetMissing = isMissingValue(targetRaw);
  const mode: DataMode = earthOverride?.mode ?? earthField.mode;
  const dataset = earthOverride?.dataset ?? `${earthField.dataset} ↔ ${targetField.dataset}`;
  const source = earthOverride?.source ?? `${earthField.source} / ${targetField.source}`;
  const resolution = earthOverride?.resolution ?? `${earthField.resolution} · ${targetField.resolution}`;

  if (earthMissing || targetMissing) {
    return {
      id,
      label,
      group,
      earthDisplay: earthMissing ? 'Missing (TODO real value)' : formatNum(earthRaw as number, earthField.unit),
      targetDisplay: targetMissing ? 'Missing (TODO real value)' : formatNum(targetRaw as number, targetField.unit),
      similarityPct: null,
      skipped: true,
      skipReason: earthMissing && targetMissing
        ? 'Missing on both Earth & Target — skipped cleanly'
        : earthMissing
          ? 'Missing on Earth site — skipped cleanly'
          : 'Missing on Target site — skipped cleanly',
      dataset,
      source,
      resolution,
      mode,
    };
  }

  const earthNorm = normalize01(id, earthRaw as number, bounds);
  const targetNorm = normalize01(id, targetRaw as number, bounds);
  const sim01 = clamp01(1 - Math.abs(earthNorm - targetNorm));

  return {
    id,
    label,
    group,
    earthDisplay: formatNum(earthRaw as number, earthField.unit),
    targetDisplay: formatNum(targetRaw as number, targetField.unit),
    similarityPct: Math.round(sim01 * 100),
    skipped: false,
    dataset,
    source,
    resolution,
    mode,
  };
}

/**
 * Evaluates a tier-mapped categorical sub-factor (e.g., dust_activity_level or water_ice_presence).
 */
function evalTierSubFactor(
  id: string,
  label: string,
  group: FactorGroupKey,
  earthField: SubFactorField<string | null>,
  targetField: SubFactorField<string | null>,
  tierMap: Record<string, number>
): SubFactorEvaluation {
  const earthMissing = isMissingValue(earthField.value);
  const targetMissing = isMissingValue(targetField.value);
  const dataset = `${earthField.dataset} ↔ ${targetField.dataset}`;
  const source = `${earthField.source} / ${targetField.source}`;
  const resolution = `${earthField.resolution} · ${targetField.resolution}`;

  if (earthMissing || targetMissing) {
    return {
      id,
      label,
      group,
      earthDisplay: earthMissing ? 'Missing (TODO real value)' : String(earthField.value),
      targetDisplay: targetMissing ? 'Missing (TODO real value)' : String(targetField.value),
      similarityPct: null,
      skipped: true,
      skipReason: 'Missing tier value — skipped cleanly',
      dataset,
      source,
      resolution,
      mode: earthField.mode,
    };
  }

  const eVal = tierMap[String(earthField.value).toLowerCase()] ?? 0.5;
  const tVal = tierMap[String(targetField.value).toLowerCase()] ?? 0.5;
  const sim01 = clamp01(1 - Math.abs(eVal - tVal));

  return {
    id,
    label,
    group,
    earthDisplay: String(earthField.value),
    targetDisplay: String(targetField.value),
    similarityPct: Math.round(sim01 * 100),
    skipped: false,
    dataset,
    source,
    resolution,
    mode: earthField.mode,
  };
}

/**
 * Evaluates `minerals_for_building_fuel` or `landforms` tag-array sub-factors.
 */
function evalTagSubFactor(
  id: string,
  label: string,
  group: FactorGroupKey,
  earthField: SubFactorField<string[] | null>,
  targetField: SubFactorField<string[] | null>
): SubFactorEvaluation {
  const earthMissing = isMissingValue(earthField.value);
  const targetMissing = isMissingValue(targetField.value);
  const dataset = `${earthField.dataset} ↔ ${targetField.dataset}`;
  const source = `${earthField.source} / ${targetField.source}`;
  const resolution = `${earthField.resolution} · ${targetField.resolution}`;

  if (earthMissing || targetMissing) {
    return {
      id,
      label,
      group,
      earthDisplay: earthMissing ? 'Missing' : (earthField.value as string[]).join(', '),
      targetDisplay: targetMissing ? 'Missing' : (targetField.value as string[]).join(', '),
      similarityPct: null,
      skipped: true,
      skipReason: 'Missing tag list — skipped cleanly',
      dataset,
      source,
      resolution,
      mode: earthField.mode,
    };
  }

  const sim01 = tagArraySimilarity(
    earthField.value as string[],
    targetField.value as string[]
  );

  return {
    id,
    label,
    group,
    earthDisplay: (earthField.value as string[]).join(', '),
    targetDisplay: (targetField.value as string[]).join(', '),
    similarityPct: Math.round(sim01 * 100),
    skipped: false,
    dataset,
    source,
    resolution,
    mode: earthField.mode,
  };
}

function summarizeGroup(
  key: FactorGroupKey,
  subFactors: SubFactorEvaluation[],
  normalizedWeight01: number,
  completenessMultiplier = 1.0
): FactorGroupResult {
  const populated = subFactors.filter((sf) => !sf.skipped && sf.similarityPct !== null);
  const avgPct =
    populated.length > 0
      ? populated.reduce((acc, sf) => acc + (sf.similarityPct ?? 0), 0) / populated.length
      : 0;

  return {
    key,
    label: FACTOR_GROUP_LABELS[key],
    scorePct: Math.round(clamp01((avgPct / 100) * completenessMultiplier) * 100),
    normalizedWeightPct: Math.round(normalizedWeight01 * 100),
    populatedCount: populated.length,
    totalCount: subFactors.length,
    subFactors,
  };
}

/**
 * Extracts initial MEM Simulator slider parameters from a selected Moon or Mars target.
 */
export function siteToTargetParams(site: PlanetarySite): SimTargetParams {
  const dayT = site.climate.temp_day_c.value ?? -20;
  const nightT = site.climate.temp_night_c.value ?? -90;
  const meanT = (dayT + nightT) / 2;
  const dustTier = (site.climate.dust_activity_level.value ?? 'medium').toLowerCase();

  return {
    temperatureC: Math.max(-150, Math.min(40, Math.round(meanT))),
    gravityG: site.gravity_g,
    roughness: site.terrain.roughness_index.value ?? 0.6,
    dustRegolith: DUST_TIER_MAP[dustTier] ?? 0.5,
    radiation: site.climate.radiation_proxy.value ?? 0.7,
  };
}

/**
 * Derives High / Medium / Low Confidence badge and explicit rationale string for tooltips.
 */
export function getConfidenceDetails(
  dataQualityScorePct: number,
  missingCount: number,
  earthSite: EarthAnalogSite,
  targetSite: PlanetarySite
): { confidence: ConfidenceLevel; explanation: string } {
  const eRes = earthSite.data_quality.dataset_resolution_m.value;
  const tRes = targetSite.data_quality.dataset_resolution_m.value;
  const eCov = Math.round((earthSite.data_quality.coverage.value ?? 0) * 100);
  const tCov = Math.round((targetSite.data_quality.coverage.value ?? 0) * 100);

  let confidence: ConfidenceLevel = 'Low';
  if (dataQualityScorePct >= 86 && missingCount === 0) {
    confidence = 'High';
  } else if (dataQualityScorePct >= 70) {
    confidence = 'Medium';
  }

  const missingNote =
    missingCount > 0
      ? `${missingCount} missing sub-factor${missingCount > 1 ? 's' : ''} skipped cleanly (lowered Data Quality by ${missingCount * 10}%). `
      : 'All 20 sub-factors populated. ';

  const explanation = `${missingNote}Earth res ${eRes ?? 'N/A'} m (${eCov}% cov) · Target res ${tRes ?? 'N/A'} m (${tCov}% cov).`;
  return { confidence, explanation };
}

/**
 * Computes full 5-group, 20-sub-factor similarity between one Earth analog and one Moon/Mars target.
 * Rules enforced:
 *  - Every numeric sub-factor normalized to 0-1 via dataset min/max
 *  - Sub-factor similarity = 1 - |earth_norm - target_norm|
 *  - Group score = average of populated sub-factors
 *  - Overall = weighted sum (normalized to 100%)
 *  - Missing values (null / "TODO real value") skipped, never invented, and lower Data Quality
 */
export function scoreEarthAgainstTarget(
  targetSite: PlanetarySite,
  earthSite: EarthAnalogSite,
  rawWeights: FactorWeights,
  bounds: DatasetBounds,
  livePower?: PowerClimatology,
  simOverrides?: SimTargetParams
): MatchResult {
  const normWeights = normalizeFactorWeights(rawWeights);
  const usedLivePower = Boolean(livePower?.isLive);

  // Simulator slider overrides (only apply when user has moved sliders away from target defaults)
  const targetRoughOverride = simOverrides ? clamp01(simOverrides.roughness) : undefined;
  const targetRadOverride = simOverrides ? clamp01(simOverrides.radiation) : undefined;
  const targetMeanTempC = simOverrides ? simOverrides.temperatureC : undefined;
  const defaultMeanTemp =
    ((targetSite.climate.temp_day_c.value ?? 0) + (targetSite.climate.temp_night_c.value ?? -80)) / 2;
  const tempShift =
    targetMeanTempC !== undefined && Math.abs(targetMeanTempC - defaultMeanTemp) > 1
      ? targetMeanTempC - defaultMeanTemp
      : 0;

  // --- 1. TERRAIN & GEOLOGY (default 30%) ---
  const rockEarth = earthSite.terrain.rock_soil_type;
  const rockTarget = targetSite.terrain.rock_soil_type;
  const rockMissing = isMissingValue(rockEarth.value) || isMissingValue(rockTarget.value);
  const rockSimPct = rockMissing
    ? null
    : Math.round(
        lookupRockSoilSimilarity(String(rockEarth.value), String(rockTarget.value)) * 100
      );

  const terrainSubFactors: SubFactorEvaluation[] = [
    {
      id: 'rock_soil_type',
      label: 'Rock / soil type',
      group: 'terrain',
      earthDisplay: rockMissing ? 'Missing' : String(rockEarth.value),
      targetDisplay: rockMissing ? 'Missing' : String(rockTarget.value),
      similarityPct: rockSimPct,
      skipped: rockMissing,
      skipReason: rockMissing ? 'Missing rock/soil class' : undefined,
      dataset: `${rockEarth.dataset} ↔ ${rockTarget.dataset}`,
      source: `${rockEarth.source} / ${rockTarget.source}`,
      resolution: `${rockEarth.resolution} · ${rockTarget.resolution}`,
      mode: rockEarth.mode,
    },
    evalNumericSubFactor(
      'slope_deg',
      'Slope angle',
      'terrain',
      earthSite.terrain.slope_deg,
      targetSite.terrain.slope_deg,
      bounds
    ),
    evalNumericSubFactor(
      'roughness_index',
      'Roughness index',
      'terrain',
      earthSite.terrain.roughness_index,
      targetSite.terrain.roughness_index,
      bounds,
      undefined,
      targetRoughOverride
    ),
    evalNumericSubFactor(
      'rock_abundance_pct',
      'Rock abundance',
      'terrain',
      earthSite.terrain.rock_abundance_pct,
      targetSite.terrain.rock_abundance_pct,
      bounds
    ),
    evalNumericSubFactor(
      'crater_boulder_density',
      'Crater / boulder density',
      'terrain',
      earthSite.terrain.crater_boulder_density,
      targetSite.terrain.crater_boulder_density,
      bounds
    ),
    evalNumericSubFactor(
      'elevation_m',
      'Elevation relief',
      'terrain',
      earthSite.terrain.elevation_m,
      targetSite.terrain.elevation_m,
      bounds
    ),
    evalTagSubFactor(
      'landforms',
      'Landforms',
      'terrain',
      earthSite.terrain.landforms,
      targetSite.terrain.landforms
    ),
  ];

  // --- 2. CLIMATE & ATMOSPHERE (default 25%) ---
  const liveMode: DataMode = usedLivePower ? 'live' : earthSite.climate.temp_day_c.mode;
  const liveSwing = livePower
    ? Number((livePower.tMaxC - livePower.tMinC).toFixed(1))
    : undefined;

  const targetDayOverride =
    tempShift !== 0 && targetSite.climate.temp_day_c.value !== null
      ? targetSite.climate.temp_day_c.value + tempShift
      : undefined;
  const targetNightOverride =
    tempShift !== 0 && targetSite.climate.temp_night_c.value !== null
      ? targetSite.climate.temp_night_c.value + tempShift
      : undefined;

  const dustEval = evalTierSubFactor(
    'dust_activity_level',
    'Dust activity level',
    'climate',
    earthSite.climate.dust_activity_level,
    targetSite.climate.dust_activity_level,
    DUST_TIER_MAP
  );
  // If simulator dust slider was moved significantly, gently nudge dust similarity
  if (simOverrides && !dustEval.skipped) {
    const earthDustNum =
      DUST_TIER_MAP[String(earthSite.climate.dust_activity_level.value).toLowerCase()] ?? 0.5;
    dustEval.similarityPct = Math.round(
      clamp01(1 - Math.abs(earthDustNum - simOverrides.dustRegolith)) * 100
    );
  }

  const climateSubFactors: SubFactorEvaluation[] = [
    evalNumericSubFactor(
      'temp_day_c',
      'Day temperature',
      'climate',
      earthSite.climate.temp_day_c,
      targetSite.climate.temp_day_c,
      bounds,
      livePower
        ? {
            value: livePower.tMaxC,
            mode: liveMode,
            dataset: `${livePower.dataset} ↔ ${targetSite.climate.temp_day_c.dataset}`,
            source: `${livePower.source} / ${targetSite.climate.temp_day_c.source}`,
            resolution: `${livePower.resolution} · ${targetSite.climate.temp_day_c.resolution}`,
          }
        : undefined,
      targetDayOverride
    ),
    evalNumericSubFactor(
      'temp_night_c',
      'Night temperature',
      'climate',
      earthSite.climate.temp_night_c,
      targetSite.climate.temp_night_c,
      bounds,
      livePower
        ? {
            value: livePower.tMinC,
            mode: liveMode,
            dataset: `${livePower.dataset} ↔ ${targetSite.climate.temp_night_c.dataset}`,
            source: `${livePower.source} / ${targetSite.climate.temp_night_c.source}`,
          }
        : undefined,
      targetNightOverride
    ),
    evalNumericSubFactor(
      'temp_swing_c',
      'Day/night swing',
      'climate',
      earthSite.climate.temp_swing_c,
      targetSite.climate.temp_swing_c,
      bounds,
      liveSwing !== undefined
        ? {
            value: liveSwing,
            mode: liveMode,
            dataset: `NASA POWER (T2M_MAX - T2M_MIN) ↔ ${targetSite.climate.temp_swing_c.dataset}`,
          }
        : undefined
    ),
    evalNumericSubFactor(
      'air_pressure_kpa',
      'Air pressure',
      'climate',
      earthSite.climate.air_pressure_kpa,
      targetSite.climate.air_pressure_kpa,
      bounds,
      livePower
        ? {
            value: livePower.pressureKpa,
            mode: liveMode,
          }
        : undefined
    ),
    evalNumericSubFactor(
      'humidity_pct',
      'Relative humidity',
      'climate',
      earthSite.climate.humidity_pct,
      targetSite.climate.humidity_pct,
      bounds,
      livePower
        ? {
            value: livePower.humidityPct,
            mode: liveMode,
          }
        : undefined
    ),
    evalNumericSubFactor(
      'wind_speed_ms',
      'Wind speed',
      'climate',
      earthSite.climate.wind_speed_ms,
      targetSite.climate.wind_speed_ms,
      bounds,
      livePower
        ? {
            value: livePower.windSpeedMs,
            mode: liveMode,
          }
        : undefined
    ),
    dustEval,
    evalNumericSubFactor(
      'radiation_proxy',
      'Radiation / altitude proxy',
      'climate',
      earthSite.climate.radiation_proxy,
      targetSite.climate.radiation_proxy,
      bounds,
      undefined,
      targetRadOverride
    ),
  ];

  // --- 3. RESOURCES (default 20%) ---
  const resourcesSubFactors: SubFactorEvaluation[] = [
    evalTierSubFactor(
      'water_ice_presence',
      'Water / ice presence',
      'resources',
      earthSite.resources.water_ice_presence,
      targetSite.resources.water_ice_presence,
      WATER_ICE_TIER_MAP
    ),
    evalTagSubFactor(
      'minerals_for_building_fuel',
      'Building & fuel minerals',
      'resources',
      earthSite.resources.minerals_for_building_fuel,
      targetSite.resources.minerals_for_building_fuel
    ),
    evalNumericSubFactor(
      'sunlight_hours_per_day',
      'Sunlight hours / day',
      'resources',
      earthSite.resources.sunlight_hours_per_day,
      targetSite.resources.sunlight_hours_per_day,
      bounds,
      livePower
        ? {
            value: livePower.sunlightHoursPerDay,
            mode: liveMode,
          }
        : undefined
    ),
  ];

  // --- 4. OPERATIONS (default 15%) ---
  const operationsSubFactors: SubFactorEvaluation[] = [
    evalNumericSubFactor(
      'distance_to_help_km',
      'Distance to nearest hub',
      'operations',
      earthSite.operations.distance_to_help_km,
      targetSite.operations.distance_to_help_km,
      bounds
    ),
    evalNumericSubFactor(
      'comm_delay_s',
      'One-way comm delay',
      'operations',
      earthSite.operations.comm_delay_s,
      targetSite.operations.comm_delay_s,
      bounds
    ),
    evalNumericSubFactor(
      'terrain_visibility',
      'Terrain visibility',
      'operations',
      earthSite.operations.terrain_visibility,
      targetSite.operations.terrain_visibility,
      bounds
    ),
    evalNumericSubFactor(
      'hazard_score',
      'Operational hazard score',
      'operations',
      earthSite.operations.hazard_score,
      targetSite.operations.hazard_score,
      bounds
    ),
  ];

  // --- 5. DATA QUALITY (default 10%) ---
  // Count any skipped sub-factors across groups 1-4 so missing data transparently lowers Data Quality
  const priorSubFactors = [
    ...terrainSubFactors,
    ...climateSubFactors,
    ...resourcesSubFactors,
    ...operationsSubFactors,
  ];
  const missingPriorCount = priorSubFactors.filter((sf) => sf.skipped).length;

  const resE = earthSite.data_quality.dataset_resolution_m;
  const resT = targetSite.data_quality.dataset_resolution_m;
  const resMissing = isMissingValue(resE.value) || isMissingValue(resT.value);
  const resToQuality01 = (m: number) => clamp01(1 - Math.max(0, Math.log10(Math.max(1, m))) / 5.0);
  const resQuality01 = resMissing
    ? null
    : clamp01(
        0.5 * (resToQuality01(resE.value as number) + resToQuality01(resT.value as number))
      );

  const covE = earthSite.data_quality.coverage;
  const covT = targetSite.data_quality.coverage;
  const covMissing = isMissingValue(covE.value) || isMissingValue(covT.value);
  const covQuality01 = covMissing
    ? null
    : clamp01(0.5 * ((covE.value as number) + (covT.value as number)));

  const dataQualitySubFactors: SubFactorEvaluation[] = [
    {
      id: 'dataset_resolution_m',
      label: 'Dataset resolution',
      group: 'dataQuality',
      earthDisplay: resMissing ? 'Missing' : formatNum(resE.value as number, resE.unit),
      targetDisplay: resMissing ? 'Missing' : formatNum(resT.value as number, resT.unit),
      similarityPct: resQuality01 !== null ? Math.round(resQuality01 * 100) : null,
      skipped: resMissing,
      skipReason: resMissing ? 'Missing resolution value' : undefined,
      dataset: `${resE.dataset} ↔ ${resT.dataset}`,
      source: `${resE.source} / ${resT.source}`,
      resolution: `${resE.resolution} · ${resT.resolution}`,
      mode: resE.mode,
    },
    {
      id: 'coverage',
      label: 'Spatial coverage',
      group: 'dataQuality',
      earthDisplay: covMissing ? 'Missing' : `${Math.round((covE.value as number) * 100)}%`,
      targetDisplay: covMissing ? 'Missing' : `${Math.round((covT.value as number) * 100)}%`,
      similarityPct: covQuality01 !== null ? Math.round(covQuality01 * 100) : null,
      skipped: covMissing,
      skipReason: covMissing ? 'Missing coverage value' : undefined,
      dataset: `${covE.dataset} ↔ ${covT.dataset}`,
      source: `${covE.source} / ${covT.source}`,
      resolution: `${covE.resolution} · ${covT.resolution}`,
      mode: covE.mode,
    },
  ];

  // Completeness penalty: each missing sub-factor reduces Data Quality by 10% (never invented)
  const missingTotal =
    missingPriorCount + dataQualitySubFactors.filter((sf) => sf.skipped).length;
  const completenessFactor = clamp01(1 - missingTotal * 0.1);

  const terrainGroup = summarizeGroup('terrain', terrainSubFactors, normWeights.terrain);
  const climateGroup = summarizeGroup('climate', climateSubFactors, normWeights.climate);
  const resourcesGroup = summarizeGroup('resources', resourcesSubFactors, normWeights.resources);
  const operationsGroup = summarizeGroup('operations', operationsSubFactors, normWeights.operations);
  const dataQualityGroup = summarizeGroup(
    'dataQuality',
    dataQualitySubFactors,
    normWeights.dataQuality,
    completenessFactor
  );

  const groupOrder: FactorGroupResult[] = [
    terrainGroup,
    climateGroup,
    resourcesGroup,
    operationsGroup,
    dataQualityGroup,
  ];

  // Re-normalize weights across groups that have >= 1 populated sub-factor
  const activeWeightSum = groupOrder.reduce(
    (acc, g) => acc + (g.populatedCount > 0 ? normWeights[g.key] : 0),
    0
  );

  const weightedSumPct = groupOrder.reduce((acc, g) => {
    if (g.populatedCount === 0 || activeWeightSum <= 0) return acc;
    return acc + g.scorePct * (normWeights[g.key] / activeWeightSum);
  }, 0);

  // Subtle gravity penalty only when user moves the simulator gravity slider
  const gravPenalty = simOverrides
    ? Math.abs(simOverrides.gravityG - targetSite.gravity_g) * 6
    : 0;

  const similarityPct = Math.round(Math.max(0, Math.min(100, weightedSumPct - gravPenalty)));

  const { confidence, explanation } = getConfidenceDetails(
    dataQualityGroup.scorePct,
    missingTotal,
    earthSite,
    targetSite
  );

  const topTwo = [...groupOrder].sort((a, b) => b.scorePct - a.scorePct).slice(0, 2);
  const reason = `Led by ${topTwo[0].label} (${topTwo[0].scorePct}%) and ${topTwo[1].label} (${topTwo[1].scorePct}%) — ${earthSite.terrain.rock_soil_type.value ?? 'analog'} terrain.`;

  return {
    earthSite,
    similarityPct,
    confidence,
    confidenceScorePct: dataQualityGroup.scorePct,
    confidenceExplanation: explanation,
    groups: {
      terrain: terrainGroup,
      climate: climateGroup,
      resources: resourcesGroup,
      operations: operationsGroup,
      dataQuality: dataQualityGroup,
    },
    groupOrder,
    missingCount: missingTotal,
    reason,
    usedLivePower,
  };
}

/**
 * Ranks all 10 Earth analog sites against the selected Moon/Mars target.
 */
export function rankEarthMatchesForTarget(
  targetSite: PlanetarySite,
  earthSites: EarthAnalogSite[],
  weights: FactorWeights,
  bounds: DatasetBounds,
  powerCache: Record<string, PowerClimatology>,
  simOverrides?: SimTargetParams
): MatchResult[] {
  return earthSites
    .map((earthSite) =>
      scoreEarthAgainstTarget(
        targetSite,
        earthSite,
        weights,
        bounds,
        powerCache[earthSite.id],
        simOverrides
      )
    )
    .sort((a, b) => b.similarityPct - a.similarityPct);
}

/**
 * Reverse match: when an Earth analog marker is clicked directly, finds its closest Moon/Mars target.
 */
export function findBestPlanetaryTargetForEarth(
  earthSite: EarthAnalogSite,
  planetarySites: PlanetarySite[],
  weights: FactorWeights,
  bounds: DatasetBounds,
  powerCache: Record<string, PowerClimatology>
): ReverseMatchResult | null {
  if (planetarySites.length === 0) return null;

  const ranked = planetarySites
    .map((pSite) => {
      const res = scoreEarthAgainstTarget(
        pSite,
        earthSite,
        weights,
        bounds,
        powerCache[earthSite.id]
      );
      return {
        planetarySite: pSite,
        similarityPct: res.similarityPct,
        confidence: res.confidence,
        confidenceExplanation: res.confidenceExplanation,
        reason: res.reason,
      };
    })
    .sort((a, b) => b.similarityPct - a.similarityPct);

  return ranked[0];
}

export type WorldId = 'moon' | 'earth' | 'mars';

export type DataMode = 'live' | 'pre-processed';

export type EarthLayerId = 'blue-marble' | 'modis-lst' | 'terra-true-color';

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export type WeightPresetId = 'balanced' | 'terrain-heavy' | 'base-building' | 'training';

/**
 * Standardized sub-factor field stored in /data/*.json.
 * Missing fields use value: null (or "TODO real value") and are cleanly skipped by the scorer.
 */
export interface SubFactorField<T = number | string | string[] | null> {
  value: T;
  unit?: string;
  source: string;
  dataset: string;
  resolution: string;
  mode: DataMode;
}

export interface SiteTerrainGroup {
  rock_soil_type: SubFactorField<string | null>;
  slope_deg: SubFactorField<number | null>;
  roughness_index: SubFactorField<number | null>;
  rock_abundance_pct: SubFactorField<number | null>;
  crater_boulder_density: SubFactorField<number | null>;
  elevation_m: SubFactorField<number | null>;
  landforms: SubFactorField<string[] | null>;
}

export interface SiteClimateGroup {
  temp_day_c: SubFactorField<number | null>;
  temp_night_c: SubFactorField<number | null>;
  temp_swing_c: SubFactorField<number | null>;
  air_pressure_kpa: SubFactorField<number | null>;
  humidity_pct: SubFactorField<number | null>;
  wind_speed_ms: SubFactorField<number | null>;
  dust_activity_level: SubFactorField<string | null>; // 'low' | 'medium' | 'high'
  radiation_proxy: SubFactorField<number | null>; // 0-1 (higher altitude = closer match)
}

export interface SiteResourcesGroup {
  water_ice_presence: SubFactorField<string | null>; // 'none' | 'trace' | 'likely' | 'confirmed'
  minerals_for_building_fuel: SubFactorField<string[] | null>;
  sunlight_hours_per_day: SubFactorField<number | null>;
}

export interface SiteOperationsGroup {
  distance_to_help_km: SubFactorField<number | null>;
  comm_delay_s: SubFactorField<number | null>;
  terrain_visibility: SubFactorField<number | null>; // 0-1 optical/radar visibility
  hazard_score: SubFactorField<number | null>; // 0-1 (higher = more hazardous)
}

export interface SiteDataQualityGroup {
  dataset_resolution_m: SubFactorField<number | null>;
  coverage: SubFactorField<number | null>; // 0-1 spatial coverage
}

export interface PlanetarySite {
  id: string;
  world: 'moon' | 'mars';
  name: string;
  region: string;
  lat: number;
  lon: number;
  seededAnalogId: string;
  gravity_g: number;
  summary: string;
  terrain: SiteTerrainGroup;
  climate: SiteClimateGroup;
  resources: SiteResourcesGroup;
  operations: SiteOperationsGroup;
  data_quality: SiteDataQualityGroup;
}

export interface EarthAnalogSite {
  id: string;
  world: 'earth';
  name: string;
  region: string;
  lat: number;
  lon: number;
  expectedTwinId: string;
  expectedTwinWorld: 'moon' | 'mars';
  gravity_g: number;
  aridity_index: number;
  volcanic_flag: boolean;
  summary: string;
  terrain: SiteTerrainGroup;
  climate: SiteClimateGroup;
  resources: SiteResourcesGroup;
  operations: SiteOperationsGroup;
  data_quality: SiteDataQualityGroup;
  radarView: {
    available: boolean;
    imageKey?: 'arid-ridges' | 'impact-crater' | 'volcanic-flows';
    instrument?: string;
    source?: string;
    caption?: string;
  };
}

export type AnySite = PlanetarySite | EarthAnalogSite;

/**
 * Live climatology returned from the keyless NASA POWER API.
 */
export interface PowerClimatology {
  tMaxC: number;
  tMinC: number;
  pressureKpa: number;
  humidityPct: number;
  windSpeedMs: number;
  solarKwhM2Day: number;
  sunlightHoursPerDay: number;
  precipMmDay: number;
  dataset: string;
  source: string;
  resolution: string;
  coverage: string;
  isLive: boolean;
  fetchedAt?: string;
  fallbackNotice?: string;
}

export interface SimTargetParams {
  temperatureC: number; // -150 to 40
  gravityG: number; // 0.16 to 1.0
  roughness: number; // 0 to 1
  dustRegolith: number; // 0 to 1
  radiation: number; // 0 to 1
}

export interface FactorWeights {
  terrain: number;
  climate: number;
  resources: number;
  operations: number;
  dataQuality: number;
}

export type FactorGroupKey = keyof FactorWeights;

export interface SubFactorEvaluation {
  id: string;
  label: string;
  group: FactorGroupKey;
  earthDisplay: string;
  targetDisplay: string;
  similarityPct: number | null; // null if skipped due to missing value
  skipped: boolean;
  skipReason?: string;
  dataset: string;
  source: string;
  resolution: string;
  mode: DataMode;
}

export interface FactorGroupResult {
  key: FactorGroupKey;
  label: string;
  scorePct: number; // 0-100 average of populated sub-factors
  normalizedWeightPct: number; // 0-100
  populatedCount: number;
  totalCount: number;
  subFactors: SubFactorEvaluation[];
}

export interface MatchResult {
  earthSite: EarthAnalogSite;
  similarityPct: number; // 0-100 overall weighted sum
  confidence: ConfidenceLevel;
  confidenceScorePct: number;
  confidenceExplanation: string;
  groups: Record<FactorGroupKey, FactorGroupResult>;
  groupOrder: FactorGroupResult[];
  missingCount: number;
  reason: string;
  usedLivePower: boolean;
}

export interface ReverseMatchResult {
  planetarySite: PlanetarySite;
  similarityPct: number;
  confidence: ConfidenceLevel;
  confidenceExplanation: string;
  reason: string;
}

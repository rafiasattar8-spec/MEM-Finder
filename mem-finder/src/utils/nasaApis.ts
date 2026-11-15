import type { EarthAnalogSite, EarthLayerId, PowerClimatology } from '../types/mem';

// In-memory cache so repeated clicks on Earth analogs never duplicate NASA POWER requests
const powerCache = new Map<string, PowerClimatology>();

export interface GibsLayerMeta {
  id: EarthLayerId;
  label: string;
  shortLabel: string;
  wmsLayer: string;
  date: string;
  dataset: string;
  source: string;
  resolution: string;
  coverage: string;
}

export const GIBS_LAYERS: Record<EarthLayerId, GibsLayerMeta> = {
  'blue-marble': {
    id: 'blue-marble',
    label: 'Blue Marble NextGen',
    shortLabel: 'Blue Marble',
    wmsLayer: 'BlueMarble_NextGeneration',
    date: '2024-07-15',
    dataset: 'Blue Marble Next Generation (500m)',
    source: 'NASA GIBS / Earth Observatory',
    resolution: '500 m/px',
    coverage: 'Global',
  },
  'modis-lst': {
    id: 'modis-lst',
    label: 'MODIS Land Surface Temp',
    shortLabel: 'MODIS LST',
    wmsLayer: 'MODIS_Terra_Land_Surface_Temp_Day',
    date: '2024-07-15',
    dataset: 'MODIS Terra Daytime LST (MOD11C1)',
    source: 'NASA GIBS / EOSDIS Worldview',
    resolution: '1 km/px',
    coverage: 'Global clear-sky',
  },
  'terra-true-color': {
    id: 'terra-true-color',
    label: 'Terra MODIS True Color',
    shortLabel: 'Terra True Color',
    wmsLayer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    date: '2024-07-15',
    dataset: 'MODIS Terra Corrected Reflectance',
    source: 'NASA GIBS / EOSDIS Worldview',
    resolution: '250 m/px',
    coverage: 'Global daily swath',
  },
};

function buildFallbackPower(site: EarthAnalogSite, errMsg?: string): PowerClimatology {
  const tMax = site.climate.temp_day_c.value ?? 25;
  const tMin = site.climate.temp_night_c.value ?? 10;
  const pressure = site.climate.air_pressure_kpa.value ?? 92;
  const humidity = site.climate.humidity_pct.value ?? 28;
  const wind = site.climate.wind_speed_ms.value ?? 4.2;
  const sunHrs = site.resources.sunlight_hours_per_day.value ?? 8.5;

  return {
    tMaxC: tMax,
    tMinC: tMin,
    pressureKpa: pressure,
    humidityPct: humidity,
    windSpeedMs: wind,
    solarKwhM2Day: Number((sunHrs * 0.65).toFixed(2)),
    sunlightHoursPerDay: sunHrs,
    precipMmDay: 0.35,
    dataset: site.climate.temp_day_c.dataset,
    source: `${site.climate.temp_day_c.source} (Bundled Baseline)`,
    resolution: site.climate.temp_day_c.resolution,
    coverage: '20-year climatology baseline',
    isLive: false,
    fallbackNotice: errMsg
      ? `Live API unavailable (${errMsg}); using pre-processed NASA POWER baseline`
      : 'Using pre-processed NASA POWER baseline',
  };
}

/**
 * Fetches live 20-year climatology from the keyless NASA POWER API:
 *   T2M_MAX (day temp C), T2M_MIN (night temp C), PS (surface pressure kPa),
 *   RH2M (relative humidity %), WS2M (wind speed m/s),
 *   ALLSKY_SFC_SW_DWN (solar irradiance kWh/m2/day), PRECTOTCORR (precip mm/day).
 */
export async function fetchNasaPowerClimatology(
  site: EarthAnalogSite
): Promise<PowerClimatology> {
  const cached = powerCache.get(site.id);
  if (cached) {
    return cached;
  }

  const params = 'T2M_MAX,T2M_MIN,PS,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PRECTOTCORR';
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=${params}&community=RE&longitude=${site.lon}&latitude=${site.lat}&format=JSON`;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 6500);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    const p = json?.properties?.parameter;

    const tMax = p?.T2M_MAX?.ANN;
    const tMin = p?.T2M_MIN?.ANN;
    const ps = p?.PS?.ANN;
    const rh = p?.RH2M?.ANN;
    const ws = p?.WS2M?.ANN;
    const sw = p?.ALLSKY_SFC_SW_DWN?.ANN;
    const precip = p?.PRECTOTCORR?.ANN;

    const valid =
      typeof tMax === 'number' &&
      tMax > -150 &&
      typeof tMin === 'number' &&
      tMin > -150 &&
      typeof ps === 'number' &&
      ps > 0 &&
      typeof rh === 'number' &&
      rh >= 0 &&
      typeof ws === 'number' &&
      ws >= 0 &&
      typeof sw === 'number' &&
      sw >= 0;

    if (!valid) {
      throw new Error('Incomplete annual climatology fill values');
    }

    // Derive effective bright sunlight hours/day from All-Sky Shortwave irradiance (kWh/m2/day)
    const sunlightHours = Number(Math.min(12.5, Math.max(3.5, sw * 1.48)).toFixed(1));

    const liveResult: PowerClimatology = {
      tMaxC: Number(tMax.toFixed(1)),
      tMinC: Number(tMin.toFixed(1)),
      pressureKpa: Number(ps.toFixed(1)),
      humidityPct: Number(rh.toFixed(1)),
      windSpeedMs: Number(ws.toFixed(1)),
      solarKwhM2Day: Number(sw.toFixed(2)),
      sunlightHoursPerDay: sunlightHours,
      precipMmDay: typeof precip === 'number' && precip >= 0 ? Number(precip.toFixed(2)) : 0.2,
      dataset: 'NASA POWER Point Climatology (T2M_MAX/MIN, PS, RH2M, WS2M, SW_DWN)',
      source: 'NASA Langley POWER API',
      resolution: '0.5° × 0.625° MERRA-2 grid (~55 km)',
      coverage: '20-year global climatology',
      isLive: true,
      fetchedAt: new Date().toISOString(),
    };

    powerCache.set(site.id, liveResult);
    return liveResult;
  } catch (err) {
    return buildFallbackPower(
      site,
      err instanceof Error ? err.message : 'Network error'
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export function loadGibsWmsImage(layerId: EarthLayerId): Promise<HTMLImageElement | null> {
  const meta = GIBS_LAYERS[layerId];
  const url = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${meta.wmsLayer}&CRS=EPSG:4326&BBOX=-90,-180,90,180&WIDTH=1024&HEIGHT=512&FORMAT=image/jpeg&TIME=${meta.date}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const timer = window.setTimeout(() => {
      resolve(null);
    }, 6500);

    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

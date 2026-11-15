import React from 'react';
import { DollarSign, ExternalLink, ShieldCheck, Wrench } from 'lucide-react';

interface SourceRow {
  factor: string;
  need: string;
  dataset: string;
  resolutionCoverage: string;
  usedFor: string;
  status: 'Live' | 'Pre-processed';
  linkLabel: string;
  url: string;
}

const SOURCE_ROWS: SourceRow[] = [
  {
    factor: 'Terrain',
    need: 'Earth Slope & Elevation',
    dataset: 'Copernicus DEM GLO-30 & NASA SRTM',
    resolutionCoverage: '30 m/px · Global',
    usedFor: 'Earth analog elevation, slope degrees, roughness & landforms',
    status: 'Pre-processed',
    linkLabel: 'dataspace.copernicus.eu',
    url: 'https://dataspace.copernicus.eu/',
  },
  {
    factor: 'Terrain',
    need: 'Earth Science Catalog Access',
    dataset: 'NASA Earthdata Search',
    resolutionCoverage: '30 m–1 km · Global',
    usedFor: 'SRTM elevation granules & MODIS terrestrial product discovery',
    status: 'Pre-processed',
    linkLabel: 'search.earthdata.nasa.gov',
    url: 'https://search.earthdata.nasa.gov/',
  },
  {
    factor: 'Terrain',
    need: 'Lunar Topography & Rock Abundance',
    dataset: 'LRO LROC, LOLA & Diviner Rock Abundance',
    resolutionCoverage: '0.5–237 m/px · Global Moon',
    usedFor: 'Moon craters, lava-tube skylights, slope roughness & boulders',
    status: 'Pre-processed',
    linkLabel: 'pds-geosciences.wustl.edu',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/',
  },
  {
    factor: 'Terrain',
    need: 'Martian Topography & Crater Morphology',
    dataset: 'MGS MOLA & MRO HiRISE / CTX',
    resolutionCoverage: '0.25–463 m/px · Global Mars',
    usedFor: 'Mars elevations, mud volcanoes, yardangs & rock abundance',
    status: 'Pre-processed',
    linkLabel: 'pds.nasa.gov',
    url: 'https://pds.nasa.gov/',
  },
  {
    factor: 'Climate',
    need: 'Earth Climatology (Temp, Rain, Solar)',
    dataset: 'NASA POWER API',
    resolutionCoverage: '0.5° × 0.625° · 20-yr global',
    usedFor: 'Live T2M_MAX, T2M_MIN, PRECTOTCORR & ALLSKY_SFC_SW_DWN',
    status: 'Live',
    linkLabel: 'power.larc.nasa.gov',
    url: 'https://power.larc.nasa.gov/',
  },
  {
    factor: 'Climate',
    need: 'Global Earth Imagery & Thermal Layers',
    dataset: 'NASA GIBS / Worldview & MODIS LST',
    resolutionCoverage: '250 m–1 km · Daily global',
    usedFor: 'Earth globe layer switcher (Blue Marble, MODIS LST, Terra)',
    status: 'Live',
    linkLabel: 'worldview.earthdata.nasa.gov',
    url: 'https://worldview.earthdata.nasa.gov/index.html',
  },
  {
    factor: 'Climate',
    need: 'Lunar Surface Temperature Swings',
    dataset: 'LRO Diviner via NASA PDS Geosciences',
    resolutionCoverage: '128 ppd (~237 m/px) · Global',
    usedFor: 'Moon day/night bolometric temperature & cave thermal stability',
    status: 'Pre-processed',
    linkLabel: 'pds-geosciences.wustl.edu/diviner',
    url: 'https://pds-geosciences.wustl.edu/missions/lro/diviner.htm',
  },
  {
    factor: 'Radar / Texture',
    need: 'C-Band SAR Surface Backscatter',
    dataset: 'CSA RCM & RADARSAT-1 Open Data',
    resolutionCoverage: '5–25 m/px · Analog footprints',
    usedFor: 'SAR radar view of salt pans, craters & volcanic lava flows',
    status: 'Pre-processed',
    linkLabel: 'donnees-data.asc-csa.gc.ca',
    url: 'https://donnees-data.asc-csa.gc.ca/en/dataset/rcm',
  },
  {
    factor: 'Radar / Texture',
    need: 'L-Band SAR Subsurface Roughness',
    dataset: 'JAXA G-Portal (ALOS-2 PALSAR-2)',
    resolutionCoverage: '6 m/px · Analog footprints',
    usedFor: 'L-band radar view of Lonar basalt crater rim & ejecta',
    status: 'Pre-processed',
    linkLabel: 'gportal.jaxa.jp',
    url: 'https://www.gportal.jaxa.jp/?lang=en',
  },
  {
    factor: 'Radar / Texture',
    need: 'Optical & SAR Mineralogy / Texture',
    dataset: 'Copernicus Data Space (Sentinel-1 / 2)',
    resolutionCoverage: '10 m/px · Global',
    usedFor: 'Hingol, Qaidam, Samail & Teide optical/SAR mineral proxies',
    status: 'Pre-processed',
    linkLabel: 'dataspace.copernicus.eu',
    url: 'https://dataspace.copernicus.eu/',
  },
  {
    factor: 'Mission Data',
    need: 'Moon & Mars Reference Conditions',
    dataset: 'NASA PDS (CRaTER, RAD, REMS, MEDA, TES)',
    resolutionCoverage: 'In-situ + orbital · Target sites',
    usedFor: 'Radiation dose, pressure, wind/dust & resource baselines',
    status: 'Pre-processed',
    linkLabel: 'pds.nasa.gov',
    url: 'https://pds.nasa.gov/',
  },
  {
    factor: 'Volcanic & Hazard',
    need: 'Volcanic, Hazard & Cryosphere Flags',
    dataset: 'USGS & Smithsonian Global Volcanism Program',
    resolutionCoverage: 'Site polygons · Global',
    usedFor: 'Basaltic/volcanic flags (Chagai, Suswa, Pinacate, Teide)',
    status: 'Pre-processed',
    linkLabel: 'volcano.si.edu',
    url: 'https://volcano.si.edu/',
  },
];

export const SourcesSection: React.FC = () => {
  return (
    <>
      <section id="sources" className="mx-auto max-w-[1280px] px-5 py-14 md:px-8">
        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-widest text-cyan-400">
            04. Open Data Provenance
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-100 md:text-3xl">
            Data &amp; Agency Sources
          </h2>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">
            Every factor in MEM Finder maps directly to open NASA, ESA Copernicus, CSA, JAXA, USGS, and Smithsonian datasets with explicit resolution and coverage tracking.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-[#0D1321]">
          <table className="w-full min-w-[920px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#080C17] font-mono uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3.5">Factor</th>
                <th className="px-4 py-3.5">Need</th>
                <th className="px-4 py-3.5">Dataset</th>
                <th className="px-4 py-3.5">Resolution &amp; Coverage</th>
                <th className="px-4 py-3.5">Used For</th>
                <th className="px-4 py-3.5">Mode</th>
                <th className="px-4 py-3.5">Link</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {SOURCE_ROWS.map((row) => (
                <tr
                  key={`${row.factor}-${row.dataset}`}
                  className="hover:bg-slate-800/35 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-orange-300">{row.factor}</td>
                  <td className="px-4 py-3 font-medium text-slate-200">{row.need}</td>
                  <td className="px-4 py-3 font-semibold text-white">{row.dataset}</td>
                  <td className="px-4 py-3 font-mono text-slate-300">{row.resolutionCoverage}</td>
                  <td className="px-4 py-3 text-slate-300">{row.usedFor}</td>
                  <td className="px-4 py-3 font-mono">
                    <span
                      className={
                        row.status === 'Live' ? 'text-cyan-300' : 'text-slate-400'
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 hover:underline"
                    >
                      <span>{row.linkLabel}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 pt-4 pb-16 md:px-8">
        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-widest text-orange-400">
            05. Mission Impact
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-100 md:text-3xl">
            Why Terrestrial Analogs Matter
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-[#0D1321] p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-white">
              Cheaper Astronaut Training
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Field campaigns in Pinacate, Teide, and Hingol validate geological sampling protocols and EVA suit ergonomics at a tiny fraction of orbital flight costs.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0D1321] p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-white">
              Safer Mission Planning
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Quantifying thermal extremes, crater rim slopes, and dust cohesion ahead of Artemis and Mars missions prevents wheel slip, thermal fatigue, and drill stalls.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-[#0D1321] p-6">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-orange-500/30 bg-orange-500/10 text-orange-400">
              <Wrench className="w-5 h-5" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-white">
              Test Tech on Earth First
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Autonomous rovers, cave skylight shelters, and ISRU salt/basalt extractors achieve TRL-7+ readiness in real hyper-arid and volcanic testbeds before launch.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800/80 bg-[#050811] no-print">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-5 py-8 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between md:px-8">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-bold text-slate-100">
              <span className="text-[#CBD5E1]">M</span>
              <span className="text-[#38BDF8]">E</span>
              <span className="text-[#F97316]">M</span>
              <span className="ml-1.5">Finder</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Moon · Earth · Mars</span>
          </div>

          <div className="font-mono text-slate-400">
            Team MEM Finder · Open Planetary Analog Initiative · MEM Finder · NASA Space Apps Challenge
          </div>
        </div>
      </footer>
    </>
  );
};

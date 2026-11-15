import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type {
  EarthAnalogSite,
  FactorGroupKey,
  FactorWeights,
  MatchResult,
  PlanetarySite,
  SimTargetParams,
  WeightPresetId,
} from '../types/mem';
import {
  DEFAULT_FACTOR_WEIGHTS,
  normalizeFactorWeights,
  WEIGHT_PRESETS,
} from '../utils/similarityEngine';
import { ConfidenceTooltipBadge } from './SiteAnalysisSection';

interface MemSimulatorProps {
  activeTargetSite: PlanetarySite;
  targetParams: SimTargetParams;
  onChangeTarget: (next: SimTargetParams) => void;
  weights: FactorWeights;
  activePreset: WeightPresetId | 'custom';
  onApplyWeightPreset: (presetId: WeightPresetId) => void;
  onChangeWeights: (next: FactorWeights) => void;
  rankedMatches: MatchResult[];
  presetSites: PlanetarySite[];
  onApplyPreset: (site: PlanetarySite) => void;
  onSelectEarthForAnalysis: (site: EarthAnalogSite) => void;
  onResetSimulator: () => void;
  highlightedForTour?: boolean;
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export const MemSimulator: React.FC<MemSimulatorProps> = ({
  activeTargetSite,
  targetParams,
  onChangeTarget,
  weights,
  activePreset,
  onApplyWeightPreset,
  onChangeWeights,
  rankedMatches,
  presetSites,
  onApplyPreset,
  onSelectEarthForAnalysis,
  onResetSimulator,
  highlightedForTour,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showAllTen, setShowAllTen] = useState(true);

  const paramsRef = useRef(targetParams);
  paramsRef.current = targetParams;
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  const simStateRef = useRef({
    scrollX: 0,
    roverY: 0,
    roverVy: 0,
    wheelAngle: 0,
    particles: [] as DustParticle[],
  });

  const handleReset = () => {
    simStateRef.current.scrollX = 0;
    simStateRef.current.roverY = 0;
    simStateRef.current.roverVy = 0;
    simStateRef.current.particles = [];
    setIsPlaying(true);
    onResetSimulator();
  };

  // 60fps requestAnimationFrame Rover Terrain Physics Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const terrainHeightAt = (worldX: number, roughness: number): number => {
      const amp = 4 + roughness * 34;
      const h1 = Math.sin(worldX * 0.018) * amp * 0.55;
      const h2 = Math.sin(worldX * 0.053 + 1.4) * amp * 0.3;
      const h3 = Math.cos(worldX * 0.13 + 0.7) * amp * 0.18 * roughness;
      return h1 + h2 + h3;
    };

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(canvas);

    const drawFrame = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const w = canvas.getBoundingClientRect().width || 640;
      const h = canvas.getBoundingClientRect().height || 210;
      const p = paramsRef.current;
      const st = simStateRef.current;

      const tempNorm = Math.max(0, Math.min(1, (p.temperatureC + 150) / 190));
      const rCol = Math.round(70 + tempNorm * 135);
      const gCol = Math.round(98 + (1 - Math.abs(tempNorm - 0.55)) * 38);
      const bCol = Math.round(145 - tempNorm * 85);

      const baseGroundY = h * 0.68;
      const roverScreenX = w * 0.28;

      if (playingRef.current) {
        const speedPx = 88 - p.roughness * 22;
        st.scrollX += speedPx * dt;
        st.wheelAngle += (speedPx * dt) / 8;

        const groundOffset = terrainHeightAt(st.scrollX + roverScreenX, p.roughness);
        const groundAhead = terrainHeightAt(st.scrollX + roverScreenX + 14, p.roughness);
        const groundY = baseGroundY + groundOffset;

        const gravAccel = 180 + (p.gravityG / 1.0) * 860;
        st.roverVy += gravAccel * dt;
        st.roverY += st.roverVy * dt;

        if (st.roverY >= groundY) {
          const bumpDelta = groundOffset - groundAhead;
          if (bumpDelta > 1.2 + (1 - p.roughness) * 3.5) {
            const kick = Math.min(220, bumpDelta * (22 + (1 - p.gravityG) * 32));
            st.roverVy = -kick;
          } else {
            st.roverVy = 0;
          }
          st.roverY = groundY;
        }

        if (Math.random() < 0.25 + p.dustRegolith * 0.65) {
          st.particles.push({
            x: roverScreenX - 24 + (Math.random() - 0.5) * 16,
            y: st.roverY - 2,
            vx: -35 - Math.random() * 45,
            vy: -15 - Math.random() * (35 + (1 - p.gravityG) * 35),
            life: 0,
            maxLife: 0.45 + p.dustRegolith * 0.6,
            size: 1.5 + Math.random() * 2.8,
          });
        }
      }

      for (let i = st.particles.length - 1; i >= 0; i--) {
        const pt = st.particles[i];
        if (playingRef.current) {
          pt.life += dt;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.vy += (40 + p.gravityG * 160) * dt;
        }
        if (pt.life >= pt.maxLife) {
          st.particles.splice(i, 1);
        }
      }

      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, '#050811');
      skyGrad.addColorStop(
        1,
        `rgba(${Math.round(14 + p.radiation * 48)}, ${Math.round(24 + (1 - p.radiation) * 18)}, ${Math.round(44 + p.radiation * 20)}, 1)`
      );
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      const streakCount = Math.floor(p.radiation * 18);
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.12 + p.radiation * 0.35})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < streakCount; i++) {
        const sx = ((i * 97 + st.scrollX * 0.4) % (w + 60)) - 30;
        const sy = (i * 53 + now * 0.08 * (1 + p.radiation)) % (baseGroundY - 20);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - 8, sy + 14);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const ty = baseGroundY + terrainHeightAt(st.scrollX + x, p.roughness);
        ctx.lineTo(x, ty);
      }
      ctx.lineTo(w, h);
      ctx.closePath();

      const terrGrad = ctx.createLinearGradient(0, baseGroundY - 30, 0, h);
      terrGrad.addColorStop(0, `rgb(${rCol}, ${gCol}, ${bCol})`);
      terrGrad.addColorStop(1, '#090d16');
      ctx.fillStyle = terrGrad;
      ctx.fill();

      ctx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const ty = baseGroundY + terrainHeightAt(st.scrollX + x, p.roughness);
        if (x === 0) ctx.moveTo(x, ty);
        else ctx.lineTo(x, ty);
      }
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      for (const pt of st.particles) {
        const alpha = (1 - pt.life / pt.maxLife) * 0.55;
        ctx.fillStyle = `rgba(${Math.min(255, rCol + 45)}, ${Math.min(255, gCol + 35)}, ${Math.min(255, bCol + 25)}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }

      const slopeLeft = terrainHeightAt(st.scrollX + roverScreenX - 24, p.roughness);
      const slopeRight = terrainHeightAt(st.scrollX + roverScreenX + 24, p.roughness);
      const pitch = Math.atan2(slopeRight - slopeLeft, 48);

      ctx.save();
      ctx.translate(roverScreenX, st.roverY);
      ctx.rotate(pitch * 0.75);

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-22, -6);
      ctx.lineTo(-10, -20);
      ctx.lineTo(14, -20);
      ctx.lineTo(22, -6);
      ctx.moveTo(0, -6);
      ctx.lineTo(4, -20);
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-17, -30, 34, 12);
      ctx.strokeRect(-17, -30, 34, 12);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(10, -30);
      ctx.lineTo(12, -46);
      ctx.stroke();

      ctx.fillStyle = '#f97316';
      ctx.fillRect(7, -50, 11, 6);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(15, -49, 3, 4);

      [-22, 0, 22].forEach((wx) => {
        ctx.save();
        ctx.translate(wx, -6);
        ctx.rotate(st.wheelAngle);
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(5, 0);
        ctx.moveTo(0, -5);
        ctx.lineTo(0, 5);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      });

      ctx.restore();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(
        `G: ${p.gravityG.toFixed(2)}g  |  TEMP: ${p.temperatureC.toFixed(0)}°C  |  ROUGH: ${p.roughness.toFixed(2)}  |  DUST: ${p.dustRegolith.toFixed(2)}`,
        12,
        20
      );

      rafId = requestAnimationFrame(drawFrame);
    };

    rafId = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  const normWeights = normalizeFactorWeights(weights);
  const displayedMatches = showAllTen ? rankedMatches : rankedMatches.slice(0, 5);

  const weightRows: Array<{
    key: FactorGroupKey;
    label: string;
    subtitle: string;
    barColor: string;
  }> = [
    {
      key: 'terrain',
      label: '1. Terrain & geology',
      subtitle: 'Rock/soil lookup, slope, roughness, rock %, boulders, elevation, landforms',
      barColor: 'bg-cyan-400',
    },
    {
      key: 'climate',
      label: '2. Climate & atmosphere',
      subtitle: 'Day/night temps, swing, pressure, humidity, wind, dust, radiation proxy',
      barColor: 'bg-sky-400',
    },
    {
      key: 'resources',
      label: '3. Resources',
      subtitle: 'Water/ice presence, building/fuel minerals & sunlight hours/day',
      barColor: 'bg-emerald-400',
    },
    {
      key: 'operations',
      label: '4. Operations',
      subtitle: 'Distance to hub, comm delay, terrain visibility & hazard score',
      barColor: 'bg-orange-400',
    },
    {
      key: 'dataQuality',
      label: '5. Data quality',
      subtitle: 'Dataset resolution, coverage & penalty for skipped missing values',
      barColor: 'bg-amber-300',
    },
  ];

  const miniBarColors: Record<FactorGroupKey, string> = {
    terrain: 'bg-cyan-400',
    climate: 'bg-sky-400',
    resources: 'bg-emerald-400',
    operations: 'bg-orange-400',
    dataQuality: 'bg-amber-300',
  };

  return (
    <section
      id="simulator"
      className={`mx-auto max-w-[1280px] px-5 py-14 md:px-8 rounded-2xl transition-all ${
        highlightedForTour ? 'ring-2 ring-cyan-400/50' : ''
      }`}
    >
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-cyan-400">
            03. Factor Weights, Leaderboard &amp; MEM Simulator
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-100 md:text-3xl">
            Weighted Leaderboard &amp; Rover Testbed vs {activeTargetSite.name}
          </h2>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl">
            Switch scoring presets or tune all 5 group weights (always normalized to 100%) to re-rank all 10 Earth sites live.
          </p>
        </div>

        {/* Target Quick-Select Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-mono text-slate-400 mr-1">Target:</span>
          {presetSites.slice(0, 6).map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => onApplyPreset(site)}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTargetSite.id === site.id
                  ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-700 bg-[#0D1321] text-slate-300 hover:border-slate-500'
              }`}
            >
              {site.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Weight Presets + 5-Factor Weight Sliders + Physical Sim Sliders */}
        <div className="lg:col-span-5 space-y-5 rounded-xl border border-slate-800 bg-[#0D1321] p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div>
              <h3 className="font-display text-base font-bold text-orange-400">
                5-Factor Weights (Sum: 100%)
              </h3>
              <p className="text-[11px] text-slate-400">
                Missing sub-factors auto-skip and re-normalize.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChangeWeights(DEFAULT_FACTOR_WEIGHTS)}
              className="inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1 text-xs font-mono text-slate-300 hover:border-cyan-400 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>

          {/* Weight Presets */}
          <div>
            <div className="text-[11px] font-mono uppercase text-slate-400 mb-1.5">
              Mission Scoring Presets
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(WEIGHT_PRESETS) as WeightPresetId[]).map((pid) => {
                const preset = WEIGHT_PRESETS[pid];
                const isAct = activePreset === pid;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => onApplyWeightPreset(pid)}
                    title={preset.description}
                    className={`rounded-lg border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                      isAct
                        ? 'border-orange-400 bg-orange-500/15 text-white'
                        : 'border-slate-800 bg-[#080C17] text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xs font-semibold">{preset.label}</div>
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      {preset.weights.terrain}/{preset.weights.climate}/{preset.weights.resources}/
                      {preset.weights.operations}/{preset.weights.dataQuality}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5 Weight Sliders */}
          <div className="space-y-3.5">
            {weightRows.map((row) => {
              const effPct = Math.round(normWeights[row.key] * 100);
              return (
                <div key={row.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-200">{row.label}</span>
                    <span className="font-mono text-orange-300">{effPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={weights[row.key]}
                    onChange={(e) =>
                      onChangeWeights({ ...weights, [row.key]: Number(e.target.value) })
                    }
                    className="mem-slider orange w-full"
                    aria-label={`${row.label} weight`}
                  />
                  <div className="mt-0.5 text-[10px] text-slate-400">{row.subtitle}</div>
                </div>
              );
            })}
          </div>

          {/* Physical Terrain & Climate Target Sliders */}
          <div className="border-t border-slate-800 pt-4 space-y-3.5">
            <h4 className="font-display text-sm font-bold text-cyan-300">
              Target Environment Override
            </h4>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="sim-temp" className="text-slate-300">
                  Temperature
                </label>
                <span className="font-mono text-cyan-300">
                  {targetParams.temperatureC.toFixed(0)} °C
                </span>
              </div>
              <input
                id="sim-temp"
                type="range"
                min={-150}
                max={40}
                step={1}
                value={targetParams.temperatureC}
                onChange={(e) =>
                  onChangeTarget({ ...targetParams, temperatureC: Number(e.target.value) })
                }
                className="mem-slider w-full"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <label htmlFor="sim-grav" className="text-slate-300">
                  Surface Gravity
                </label>
                <span className="font-mono text-cyan-300">
                  {targetParams.gravityG.toFixed(2)} g
                </span>
              </div>
              <input
                id="sim-grav"
                type="range"
                min={0.16}
                max={1.0}
                step={0.01}
                value={targetParams.gravityG}
                onChange={(e) =>
                  onChangeTarget({ ...targetParams, gravityG: Number(e.target.value) })
                }
                className="mem-slider w-full"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300">Roughness</span>
                  <span className="font-mono text-cyan-300">
                    {targetParams.roughness.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={targetParams.roughness}
                  onChange={(e) =>
                    onChangeTarget({ ...targetParams, roughness: Number(e.target.value) })
                  }
                  className="mem-slider w-full"
                  aria-label="Terrain roughness"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300">Dust</span>
                  <span className="font-mono text-cyan-300">
                    {targetParams.dustRegolith.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={targetParams.dustRegolith}
                  onChange={(e) =>
                    onChangeTarget({ ...targetParams, dustRegolith: Number(e.target.value) })
                  }
                  className="mem-slider w-full"
                  aria-label="Dust and regolith"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-300">Radiation</span>
                  <span className="font-mono text-cyan-300">
                    {targetParams.radiation.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={targetParams.radiation}
                  onChange={(e) =>
                    onChangeTarget({ ...targetParams, radiation: Number(e.target.value) })
                  }
                  className="mem-slider w-full"
                  aria-label="Radiation flux"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Ranked 10-Site Leaderboard (with 5 mini factor bars + confidence tooltips) + 60fps Rover Canvas */}
        <div className="lg:col-span-7 space-y-5">
          <div className="rounded-xl border border-slate-800 bg-[#0D1321] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-100">
                  Ranked Earth Leaderboard vs {activeTargetSite.name}
                </h3>
                <p className="text-xs text-slate-400">
                  Click any Earth site to inspect its 20 sub-factors above · Top 3 connect by 3D arcs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAllTen((v) => !v)}
                className="rounded border border-slate-700 px-2.5 py-1 text-xs font-mono text-cyan-300 hover:border-cyan-400 cursor-pointer"
              >
                {showAllTen ? 'Show Top 5' : 'Show All 10'}
              </button>
            </div>

            {/* Mini bar color legend */}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-slate-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-cyan-400" /> Terrain
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-sky-400" /> Climate
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-emerald-400" /> Resources
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-orange-400" /> Operations
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-amber-300" /> Data Quality
              </span>
            </div>

            <div className="mt-3 space-y-2.5">
              {displayedMatches.map((match, idx) => (
                <div
                  key={match.earthSite.id}
                  onClick={() => onSelectEarthForAnalysis(match.earthSite)}
                  className="rounded-lg border border-slate-800/90 bg-[#080C17] p-3 hover:border-cyan-500/60 transition-colors cursor-pointer"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-slate-400 shrink-0">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <span className="font-semibold text-slate-100 truncate">
                        {match.earthSite.name}
                      </span>
                      <ConfidenceTooltipBadge
                        level={match.confidence}
                        scorePct={match.confidenceScorePct}
                        explanation={match.confidenceExplanation}
                      />
                    </div>
                    <span
                      className={`font-mono text-sm font-bold shrink-0 ${
                        idx === 0
                          ? 'text-amber-300'
                          : idx < 3
                            ? 'text-cyan-300'
                            : 'text-slate-300'
                      }`}
                    >
                      {match.similarityPct}%
                    </span>
                  </div>

                  {/* Overall match bar */}
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-slate-900 border border-slate-800">
                    <div
                      className={`h-full transition-all duration-150 ${
                        idx === 0
                          ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                          : idx < 3
                            ? 'bg-gradient-to-r from-cyan-600 to-sky-400'
                            : 'bg-slate-600'
                      }`}
                      style={{ width: `${match.similarityPct}%` }}
                    />
                  </div>

                  {/* 5 Mini Bars (one per factor group) */}
                  <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {match.groupOrder.map((grp) => (
                      <div key={grp.key} title={`${grp.label}: ${grp.scorePct}%`}>
                        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                          <span className="truncate">{grp.label.split(' ')[0]}</span>
                          <span className="text-slate-300">{grp.scorePct}%</span>
                        </div>
                        <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
                          <div
                            className={`h-full ${miniBarColors[grp.key]}`}
                            style={{ width: `${grp.scorePct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 60fps Rover Physics Canvas */}
          <div className="rounded-xl border border-slate-800 bg-[#0D1321] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-100">
                  60fps Rover Suspension &amp; Terrain Traverse
                </h3>
                <p className="text-[11px] text-slate-400">
                  Color, slope roughness, dust plume, and gravity bounce respond live to sliders.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlaying((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>Play</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 bg-[#080C17] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              className="h-[210px] w-full rounded-lg border border-slate-800 bg-[#050811]"
              aria-label="Live 60fps rover terrain physics simulation"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

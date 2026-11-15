import React from 'react';
import type { FactorGroupKey, FactorGroupResult } from '../types/mem';

interface RadarChartSvgProps {
  primaryGroups: Record<FactorGroupKey, FactorGroupResult>;
  primaryLabel: string;
  targetLabel: string;
  secondaryGroups?: Record<FactorGroupKey, FactorGroupResult>;
  secondaryLabel?: string;
  size?: number;
  variant?: 'dark' | 'light';
}

const AXES: Array<{ key: FactorGroupKey; shortLabel: string }> = [
  { key: 'terrain', shortLabel: 'Terrain' },
  { key: 'climate', shortLabel: 'Climate' },
  { key: 'resources', shortLabel: 'Resources' },
  { key: 'operations', shortLabel: 'Operations' },
  { key: 'dataQuality', shortLabel: 'Data Quality' },
];

/**
 * 5-axis SVG Radar (Spider) Chart comparing Earth analog factor group scores
 * against the 100% Moon/Mars Target reference envelope, with optional Site B overlay
 * for side-by-side Compare Mode and print-ready mission reports.
 */
export const RadarChartSvg: React.FC<RadarChartSvgProps> = ({
  primaryGroups,
  primaryLabel,
  targetLabel,
  secondaryGroups,
  secondaryLabel,
  size = 290,
  variant = 'dark',
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.31;
  const isLight = variant === 'light';

  const getPoint = (axisIdx: number, pct: number) => {
    // Start straight up (-90 deg) and step clockwise by 72 deg (2*PI/5)
    const angle = -Math.PI / 2 + (axisIdx * 2 * Math.PI) / AXES.length;
    const r = radius * (Math.max(0, Math.min(100, pct)) / 100);
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      angle,
    };
  };

  const buildPolygonPoints = (pctByAxis: number[]) =>
    pctByAxis
      .map((pct, idx) => {
        const pt = getPoint(idx, pct);
        return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
      })
      .join(' ');

  const primaryScores = AXES.map((a) => primaryGroups[a.key]?.scorePct ?? 0);
  const secondaryScores = secondaryGroups
    ? AXES.map((a) => secondaryGroups[a.key]?.scorePct ?? 0)
    : null;

  const gridLevels = [20, 40, 60, 80, 100];

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`5-axis factor similarity radar chart comparing ${primaryLabel} against ${targetLabel}`}
        className="overflow-visible select-none"
      >
        {/* Concentric grid rings */}
        {gridLevels.map((lvl) => (
          <polygon
            key={lvl}
            points={buildPolygonPoints(AXES.map(() => lvl))}
            fill="none"
            stroke={
              lvl === 100
                ? isLight
                  ? '#94a3b8'
                  : 'rgba(148, 163, 184, 0.35)'
                : isLight
                  ? '#e2e8f0'
                  : 'rgba(148, 163, 184, 0.16)'
            }
            strokeWidth={lvl === 100 ? 1.25 : 1}
            strokeDasharray={lvl === 100 ? '4 3' : undefined}
          />
        ))}

        {/* Radial spoke lines */}
        {AXES.map((axis, idx) => {
          const outer = getPoint(idx, 100);
          return (
            <line
              key={axis.key}
              x1={cx}
              y1={cy}
              x2={outer.x}
              y2={outer.y}
              stroke={isLight ? '#cbd5e1' : 'rgba(148, 163, 184, 0.22)'}
              strokeWidth={1}
            />
          );
        })}

        {/* Scale numbers along the top vertical axis */}
        {[40, 80].map((lvl) => {
          const pt = getPoint(0, lvl);
          return (
            <text
              key={lvl}
              x={pt.x + 4}
              y={pt.y + 3}
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
              fill={isLight ? '#64748b' : '#64748b'}
            >
              {lvl}%
            </text>
          );
        })}

        {/* Secondary Earth analog polygon (Compare Mode) */}
        {secondaryScores && (
          <g>
            <polygon
              points={buildPolygonPoints(secondaryScores)}
              fill={isLight ? 'rgba(249, 115, 22, 0.16)' : 'rgba(249, 115, 22, 0.22)'}
              stroke="#f97316"
              strokeWidth={2}
            />
            {secondaryScores.map((pct, idx) => {
              const pt = getPoint(idx, pct);
              return (
                <circle
                  key={`sec-${AXES[idx].key}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={3.2}
                  fill="#f97316"
                  stroke={isLight ? '#ffffff' : '#080C17'}
                  strokeWidth={1}
                />
              );
            })}
          </g>
        )}

        {/* Primary Earth analog polygon */}
        <g>
          <polygon
            points={buildPolygonPoints(primaryScores)}
            fill={isLight ? 'rgba(14, 165, 233, 0.2)' : 'rgba(34, 211, 238, 0.24)'}
            stroke={isLight ? '#0284c7' : '#22d3ee'}
            strokeWidth={2.2}
          />
          {primaryScores.map((pct, idx) => {
            const pt = getPoint(idx, pct);
            return (
              <circle
                key={`pri-${AXES[idx].key}`}
                cx={pt.x}
                cy={pt.y}
                r={3.8}
                fill={isLight ? '#0284c7' : '#22d3ee'}
                stroke={isLight ? '#ffffff' : '#080C17'}
                strokeWidth={1.2}
              />
            );
          })}
        </g>

        {/* Axis labels & numeric readouts */}
        {AXES.map((axis, idx) => {
          const labelPt = getPoint(idx, 126);
          const cos = Math.cos(labelPt.angle);
          const textAnchor =
            Math.abs(cos) < 0.22 ? 'middle' : cos > 0 ? 'start' : 'end';
          const score = primaryScores[idx];
          const secScore = secondaryScores ? secondaryScores[idx] : null;

          return (
            <g key={axis.key}>
              <text
                x={labelPt.x}
                y={labelPt.y - 3}
                textAnchor={textAnchor}
                fontSize={10.5}
                fontWeight={600}
                fontFamily="Plus Jakarta Sans, sans-serif"
                fill={isLight ? '#0f172a' : '#e2e8f0'}
              >
                {axis.shortLabel}
              </text>
              <text
                x={labelPt.x}
                y={labelPt.y + 10}
                textAnchor={textAnchor}
                fontSize={10}
                fontFamily="JetBrains Mono, monospace"
                fill={isLight ? '#0284c7' : '#38bdf8'}
              >
                {secScore !== null ? `${score}% vs ${secScore}%` : `${score}%`}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div
        className={`mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] font-mono ${
          isLight ? 'text-slate-700' : 'text-slate-300'
        }`}
      >
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-xs ${
              isLight ? 'bg-sky-600' : 'bg-cyan-400'
            }`}
          />
          <span>{primaryLabel}</span>
        </span>
        {secondaryLabel && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-xs bg-orange-500" />
            <span>{secondaryLabel}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 opacity-80">
          <span className="inline-block w-3 border-t border-dashed border-slate-400" />
          <span>{targetLabel} (100% ref)</span>
        </span>
      </div>
    </div>
  );
};

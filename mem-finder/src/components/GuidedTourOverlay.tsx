import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  targetAnchor: string;
  highlightKey: 'worlds' | 'sites' | 'layers' | 'simulator' | 'sources';
  durationSec: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'step-1',
    title: '1/5 · 21 Sites Across Moon, Earth & Mars',
    body: 'Explore 6 Moon targets, 5 Mars targets, and 10 Earth analogs (5 Mars twins + 5 Moon twins) on synchronized 3D globes.',
    targetAnchor: 'worlds',
    highlightKey: 'worlds',
    durationSec: 6,
  },
  {
    id: 'step-2',
    title: '2/5 · Top-3 Match Arcs & Confidence Badges',
    body: 'Clicking any Moon or Mars marker ranks all 10 Earth analogs via the 5-factor model and traces 3 live arcs to the top matches.',
    targetAnchor: 'sites',
    highlightKey: 'sites',
    durationSec: 6,
  },
  {
    id: 'step-3',
    title: '3/5 · Similarity Heatmap & NASA GIBS Layers',
    body: 'Toggle "Similarity heatmap" to color all 10 Earth markers green/amber/red, and switch GIBS layers (MODIS LST, Terra, Blue Marble).',
    targetAnchor: 'worlds',
    highlightKey: 'layers',
    durationSec: 6,
  },
  {
    id: 'step-4',
    title: '4/5 · 5-Tab Site Analysis, Radar & Compare Mode',
    body: 'Inspect all 20+ sub-factors across 5 group tabs, compare 2 Earth sites on a 5-axis radar chart, and switch mission weight presets.',
    targetAnchor: 'analysis',
    highlightKey: 'simulator',
    durationSec: 6,
  },
  {
    id: 'step-5',
    title: '5/5 · Provenance, SAR Radar & Export Brief',
    body: 'Inspect resolution & coverage provenance, view CSA/JAXA SAR radar backscatter, and export a report with Radar Chart and data sources.',
    targetAnchor: 'sources',
    highlightKey: 'sources',
    durationSec: 6,
  },
];

interface GuidedTourOverlayProps {
  active: boolean;
  stepIndex: number;
  onChangeStep: (idx: number) => void;
  onClose: () => void;
}

export const GuidedTourOverlay: React.FC<GuidedTourOverlayProps> = ({
  active,
  stepIndex,
  onChangeStep,
  onClose,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(6);

  const currentStep = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];

  useEffect(() => {
    if (!active) return;
    setSecondsLeft(currentStep.durationSec);

    const el = document.getElementById(currentStep.targetAnchor);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [active, stepIndex, currentStep]);

  useEffect(() => {
    if (!active) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (stepIndex + 1 < TOUR_STEPS.length) {
            onChangeStep(stepIndex + 1);
            return TOUR_STEPS[stepIndex + 1].durationSec;
          } else {
            onClose();
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [active, stepIndex, onChangeStep, onClose]);

  if (!active) return null;

  const progressPct =
    ((stepIndex + (1 - secondsLeft / currentStep.durationSec)) / TOUR_STEPS.length) * 100;

  return (
    <aside
      aria-label="30-second guided tour"
      className="fixed bottom-4 right-4 z-50 w-[min(410px,calc(100vw-2rem))] rounded-xl border border-cyan-400/70 bg-[#090F1E] p-4 shadow-2xl no-print"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
            30s Judge Walkthrough · {secondsLeft}s
          </span>
          <h4 className="mt-0.5 font-display text-base font-bold text-white">
            {currentStep.title}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guided tour"
          className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-slate-300">
        {currentStep.body}
      </p>

      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full bg-gradient-to-r from-cyan-400 to-orange-400 transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(5, progressPct))}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChangeStep(Math.max(0, stepIndex - 1))}
          disabled={stepIndex === 0}
          className="inline-flex items-center gap-1 rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 disabled:opacity-40 hover:border-slate-500 cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Prev</span>
        </button>

        <div className="flex gap-1.5">
          {TOUR_STEPS.map((st, idx) => (
            <button
              key={st.id}
              type="button"
              onClick={() => onChangeStep(idx)}
              aria-label={`Jump to step ${idx + 1}`}
              className={`h-2 w-2 rounded-full cursor-pointer transition-colors ${
                idx === stepIndex ? 'bg-cyan-400' : 'bg-slate-700 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>

        {stepIndex < TOUR_STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => onChangeStep(stepIndex + 1)}
            className="inline-flex items-center gap-1 rounded bg-cyan-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400 cursor-pointer"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded bg-orange-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-orange-400 cursor-pointer"
          >
            <span>Finish</span>
          </button>
        )}
      </div>
    </aside>
  );
};

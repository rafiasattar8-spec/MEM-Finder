import React from 'react';

interface LoadingScreenProps {
  visible: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ visible }) => {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#060911] px-6 transition-opacity duration-500"
      role="status"
      aria-live="polite"
      aria-label="Loading MEM Finder"
    >
      {/* Orbiting three-dot Moon / Earth / Mars loader */}
      <div className="relative flex items-center justify-center w-36 h-12 mb-5">
        <div className="absolute inset-x-4 h-px bg-slate-800" aria-hidden="true" />
        <span className="mem-dot-moon absolute w-3.5 h-3.5 rounded-full bg-[#CBD5E1] shadow-[0_0_12px_rgba(203,213,225,0.6)]" />
        <span className="mem-dot-earth absolute w-4 h-4 rounded-full bg-[#38BDF8] shadow-[0_0_14px_rgba(56,189,248,0.75)]" />
        <span className="mem-dot-mars absolute w-3.5 h-3.5 rounded-full bg-[#F97316] shadow-[0_0_12px_rgba(249,115,22,0.7)]" />
      </div>

      {/* Brand wordmark */}
      <div className="font-display text-2xl font-bold tracking-tight text-slate-100">
        <span className="text-[#CBD5E1]">M</span>
        <span className="text-[#38BDF8]">E</span>
        <span className="text-[#F97316]">M</span>
        <span className="ml-2 text-slate-100">Finder</span>
      </div>

      <p className="mt-1.5 text-xs font-mono tracking-wider text-slate-400">
        Moon · Earth · Mars
      </p>
      <p className="mt-4 text-xs text-slate-400">
        Initializing planetary elevation &amp; analog telemetry
      </p>
    </div>
  );
};

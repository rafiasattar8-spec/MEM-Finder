import React from 'react';
import { Play } from 'lucide-react';

interface NavbarProps {
  onStartTour: () => void;
  tourActive: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ onStartTour, tourActive }) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-[#060911]/90 backdrop-blur-md no-print">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-8 px-5 py-3.5 md:px-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#hero"
          className="font-display text-xl font-bold tracking-tight whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-sm"
        >
          <span className="text-[#CBD5E1]">M</span>
          <span className="text-[#38BDF8]">E</span>
          <span className="text-[#F97316]">M</span>
          <span className="ml-1.5 text-slate-100">Finder</span>
        </a>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300"
        >
          <a
            href="#worlds"
            className="whitespace-nowrap shrink-0 hover:text-cyan-300 transition-colors duration-150"
          >
            Three Worlds
          </a>
          <a
            href="#sites"
            className="whitespace-nowrap shrink-0 hover:text-cyan-300 transition-colors duration-150"
          >
            Site Matcher
          </a>
          <a
            href="#analysis"
            className="whitespace-nowrap shrink-0 hover:text-cyan-300 transition-colors duration-150"
          >
            Site Analysis
          </a>
          <a
            href="#simulator"
            className="whitespace-nowrap shrink-0 hover:text-cyan-300 transition-colors duration-150"
          >
            MEM Simulator
          </a>
          <a
            href="#sources"
            className="whitespace-nowrap shrink-0 hover:text-cyan-300 transition-colors duration-150"
          >
            Data &amp; Sources
          </a>
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onStartTour}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              tourActive
                ? 'bg-orange-500 text-slate-950 hover:bg-orange-400'
                : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{tourActive ? 'Tour Active' : '30s Guided Tour'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

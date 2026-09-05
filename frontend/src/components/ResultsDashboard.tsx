import React, { useMemo } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Scan
} from 'lucide-react';
import AnimatedCounter from './AnimatedCounter';
import { AnalysisData } from '../types/forensics';

interface ResultsDashboardProps {
  results: AnalysisData;
  previewUrl: string | null;
  barsLoaded: boolean;
  onReset: () => void;
  onImageEnlarge: () => void;
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
  results,
  previewUrl,
  barsLoaded,
  onReset,
  onImageEnlarge
}) => {
  // Memoize module list to avoid child re-renders when parent state changes
  const moduleList = useMemo(() => results.modules, [results.modules]);

  return (
    <div className="space-y-6">
      {/* Top Overview Card */}
      <div className="bg-[#11141E] rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl">
        {/* Full-width image display */}
        {previewUrl && (
          <div
            className="relative w-full max-h-[380px] rounded-2xl overflow-hidden border-2 border-orange-500/40 mb-6 bg-black cursor-zoom-in group select-none"
            onClick={onImageEnlarge}
            title="Click to view full image"
          >
            <img
              src={previewUrl}
              alt="Analyzed target"
              className="w-full h-full max-h-[376px] object-contain transition-transform duration-300 group-hover:scale-[1.02]"
              loading="lazy"
            />

            {/* Holographic tint overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 via-transparent to-orange-500/10 pointer-events-none" />

            {/* Scanning laser line */}
            <div className="absolute inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-orange-400 to-transparent shadow-[0_0_12px_#FF7700] animate-scan-vertical pointer-events-none" />

            {/* Blueprint grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#FF770010_1px,transparent_1px),linear-gradient(to_bottom,#FF770010_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none opacity-40" />

            {/* Corner brackets */}
            <div className="absolute top-2.5 left-2.5 w-4 h-4 border-t-2 border-l-2 border-orange-400/70 pointer-events-none" />
            <div className="absolute top-2.5 right-2.5 w-4 h-4 border-t-2 border-r-2 border-orange-400/70 pointer-events-none" />
            <div className="absolute bottom-2.5 left-2.5 w-4 h-4 border-b-2 border-l-2 border-orange-400/70 pointer-events-none" />
            <div className="absolute bottom-2.5 right-2.5 w-4 h-4 border-b-2 border-r-2 border-orange-400/70 pointer-events-none" />

            {/* Status chip */}
            <div className="absolute bottom-2.5 inset-x-0 flex justify-center pointer-events-none">
              <span className="text-[9px] font-mono font-bold text-orange-300 bg-black/80 backdrop-blur-sm px-2 py-0.5 rounded-md border border-orange-500/30 tracking-wider uppercase">
                Scan Complete — Click to Enlarge
              </span>
            </div>
          </div>
        )}

        {/* File info + verdict row */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {results.filename}
            </h2>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  results.overallProbability > 50
                    ? 'bg-red-500/15 text-red-400 border-red-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {results.overallProbability > 50 ? (
                  <ShieldAlert className="w-3.5 h-3.5" />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5" />
                )}
                <span>{results.verdict}</span>
              </span>

              <span className="text-xs text-gray-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full font-mono font-medium">
                {results.confidenceGrade}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={onReset}
              className="inline-flex items-center gap-2 text-xs font-semibold text-white bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2.5 rounded-full transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Analyze Another</span>
            </button>
          </div>
        </div>

        {/* AI Probability Progress Gauge with animated count-up and fill */}
        <div className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Scan className="w-3.5 h-3.5 text-orange-400" />
              Probability of AI Generation
            </span>
            <span
              className={`text-2xl font-mono font-extrabold ${
                results.overallProbability > 50 ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              <AnimatedCounter value={results.overallProbability} duration={1200} suffix="%" />
            </span>
          </div>

          {/* Progress Bar Container with smooth width animation */}
          <div className="w-full bg-[#0D0F16] h-4 rounded-full overflow-hidden p-0.5 border border-white/10">
            <div
              className={`h-full rounded-full ${
                results.overallProbability > 65
                  ? 'bg-gradient-to-r from-amber-500 to-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
                  : results.overallProbability > 35
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]'
                  : 'bg-gradient-to-r from-emerald-400 to-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.5)]'
              }`}
              style={{
                width: `${barsLoaded ? Math.max(results.overallProbability, 4) : 0}%`,
                transition: 'width 1.2s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />
          </div>

          <div className="flex justify-between text-[11px] font-mono text-gray-400 mt-2">
            <span>0% Authentic Sensor</span>
            <span>50% Threshold</span>
            <span>100% Fully Synthetic</span>
          </div>
        </div>
      </div>

      {/* AI Explanation & Summary */}
      {results.explanation && (
        <div className="bg-[#11141E] rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl">
          <div className="flex items-center gap-2 mb-4 text-white font-bold text-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
            Gemini Vision Analysis
          </div>
          <p className="text-sm text-gray-300 leading-relaxed bg-[#0D0F16] p-4 sm:p-6 rounded-2xl border border-white/5 shadow-inner">
            {results.explanation}
          </p>
        </div>
      )}

      {/* Forensic Module Scores Breakdown */}
      <div className="bg-[#11141E] rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-bold text-white">
              Forensic Module Diagnostic Breakdown
            </h3>
            <p className="text-xs text-gray-400">
              Independent algorithmic test scores from specialized anomaly detectors.
            </p>
          </div>
          <span className="text-xs font-mono text-gray-400 hidden sm:block">
            {moduleList.length} passes
          </span>
        </div>

        <div className="space-y-4">
          {moduleList.map((mod) => (
            <div
              key={mod.id}
              className="p-4 sm:p-5 rounded-2xl bg-[#0D0F16] border border-white/5 hover:border-white/15 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      mod.score > 50 ? 'bg-red-400' : 'bg-emerald-400'
                    }`}
                  />
                  <h4 className="text-sm font-bold text-white">{mod.name}</h4>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">Anomaly Risk:</span>
                  <span
                    className={`text-xs font-mono font-bold ${
                      mod.score > 50 ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    <AnimatedCounter value={mod.score} duration={1100} suffix="%" />
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-400 mb-4">{mod.description}</p>

              {/* Small metric progress bar */}
              <div className="w-full bg-[#181B26] h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    mod.score > 50 ? 'bg-red-500' : 'bg-emerald-500'
                  }`}
                  style={{
                    width: `${barsLoaded ? Math.max(mod.score, 2) : 0}%`,
                    transition: 'width 1.1s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

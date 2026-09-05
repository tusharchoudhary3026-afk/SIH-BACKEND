import React, { useMemo, useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Scan,
  AlertTriangle,
  Cpu,
  Layers,
  FileCheck2,
  ChevronDown,
  ChevronUp
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
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Memoize module list to avoid child re-renders when parent state changes
  const moduleList = useMemo(() => results.modules, [results.modules]);
  const isAi = results.overallProbability > 50;

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. TOP OVERVIEW CARD (IMAGE, VERDICT, AI PROBABILITY GAUGE)               */}
      {/* ========================================================================= */}
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
                  isAi
                    ? 'bg-red-500/15 text-red-400 border-red-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {isAi ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{results.verdict}</span>
              </span>

              <span className="text-xs text-gray-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full font-mono font-medium">
                {results.confidenceGrade}
              </span>

              {results.unifiedVerdict?.riskLevel && (
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                    results.unifiedVerdict.riskLevel === 'CRITICAL'
                      ? 'bg-red-500/20 text-red-400 border-red-500/40'
                      : results.unifiedVerdict.riskLevel === 'HIGH'
                      ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : results.unifiedVerdict.riskLevel === 'MEDIUM'
                      ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  }`}
                >
                  RISK: {results.unifiedVerdict.riskLevel}
                </span>
              )}

              {results.unifiedVerdict?.recommendedAction && (
                <span
                  className={`text-xs font-mono font-bold px-2.5 py-1 rounded-full border ${
                    results.unifiedVerdict.recommendedAction === 'REJECT'
                      ? 'bg-red-950 text-red-300 border-red-700'
                      : results.unifiedVerdict.recommendedAction === 'MANUAL_REVIEW'
                      ? 'bg-amber-950 text-amber-300 border-amber-700'
                      : 'bg-emerald-950 text-emerald-300 border-emerald-700'
                  }`}
                >
                  ACTION: {results.unifiedVerdict.recommendedAction}
                </span>
              )}
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
                isAi ? 'text-red-400' : 'text-emerald-400'
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

      {/* ========================================================================= */}
      {/* 2. EXECUTIVE FORENSIC ASSESSMENT                                          */}
      {/* ========================================================================= */}
      {(results.unifiedVerdict?.executiveSummary || results.explanation) && (
        <div className="bg-[#11141E] rounded-3xl p-6 sm:p-8 border border-white/10 shadow-2xl">
          <div className="flex items-center gap-2 mb-4 text-white font-bold text-base sm:text-lg">
            <FileCheck2 className="w-4 h-4 text-orange-400" />
            <span>Executive Forensic Assessment</span>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed bg-[#0D0F16] p-4 sm:p-5 rounded-2xl border border-white/5">
            {results.unifiedVerdict?.executiveSummary || results.explanation}
          </p>

          {/* Key Findings Anomaly Badges */}
          {results.unifiedVerdict?.detectedAnomalies && results.unifiedVerdict.detectedAnomalies.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Cross-Correlated Anomaly Findings
              </span>
              <div className="flex flex-wrap gap-2">
                {results.unifiedVerdict.detectedAnomalies.map((anom, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-xs text-gray-300 bg-[#0D0F16] border border-white/10 px-3 py-1.5 rounded-xl"
                  >
                    <span className="text-orange-400 font-bold">•</span>
                    {anom}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TECHNICAL TELEMETRY & MODULE BREAKDOWN (COLLAPSIBLE)                   */}
      {/* ========================================================================= */}
      <div className="bg-[#11141E] rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
        <button
          onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
          className="w-full flex items-center justify-between p-6 sm:p-7 hover:bg-white/[0.02] transition-colors cursor-pointer text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/5 text-orange-400">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Technical Diagnostics & Engine Breakdown
                <span className="text-xs font-mono font-normal text-gray-400">
                  ({moduleList.length} algorithmic passes)
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Click to {showTechnicalDetails ? 'hide' : 'inspect'} PyTorch SDXL classifier, moiré liveness, and signal metrics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <span>{showTechnicalDetails ? 'Collapse' : 'Expand'}</span>
            {showTechnicalDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showTechnicalDetails && (
          <div className="px-6 sm:px-8 pb-6 sm:pb-8 pt-2 space-y-6 border-t border-white/5">
            {/* Layer B Telemetry Grid */}
            {results.layerB && (
              <div>
                <h4 className="text-xs font-mono font-semibold uppercase text-gray-400 mb-3 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-orange-400" />
                  Layer B: Deep Neural & Signal Telemetry
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* SDXL Diffusion Classifier */}
                  <div className="bg-[#0D0F16] p-3.5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-400">SDXL Diffusion</span>
                      <span className="text-xs font-mono font-bold text-white">
                        {results.layerB.sdxlClassifier?.aiProbability != null
                          ? `${Math.round(results.layerB.sdxlClassifier.aiProbability * 100)}%`
                          : 'N/A'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {results.layerB.sdxlClassifier?.aiProbability != null && results.layerB.sdxlClassifier.aiProbability >= 0.5 ? (
                        <span className="text-red-400 font-semibold">Diffusion latent match</span>
                      ) : (
                        <span className="text-emerald-400 font-semibold">Natural distribution</span>
                      )}
                    </p>
                  </div>

                  {/* Recapture / Moiré */}
                  <div className="bg-[#0D0F16] p-3.5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-400">Recapture / Moiré</span>
                      <span
                        className={`text-xs font-mono font-bold ${
                          results.layerB.liveness?.verdict === 'LIVE' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {results.layerB.liveness?.verdict || 'N/A'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Consistency: {results.layerB.liveness?.livenessConsistencyScore ?? 0}/100
                    </p>
                  </div>

                  {/* Doc Splicing */}
                  <div className="bg-[#0D0F16] p-3.5 rounded-xl border border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-gray-400">Doc Splicing</span>
                      <span
                        className={`text-xs font-mono font-bold ${
                          results.layerB.documentForensics?.decision === 'CLEAR' ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {results.layerB.documentForensics?.decision || 'N/A'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Risk: {results.layerB.documentForensics?.riskScore ?? 0}/100
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Cross-layer correlation explanation */}
            {results.unifiedVerdict?.layerCorrelations && (
              <div className="bg-[#0D0F16] p-4 rounded-xl border border-white/5">
                <span className="text-xs font-mono font-semibold uppercase text-gray-400 block mb-1">
                  Layer Cross-Correlation Justification
                </span>
                <p className="text-xs text-gray-300 leading-relaxed">
                  {results.unifiedVerdict.layerCorrelations}
                </p>
              </div>
            )}

            {/* Forensic Module Diagnostic Passes */}
            <div>
              <h4 className="text-xs font-mono font-semibold uppercase text-gray-400 mb-3 flex items-center gap-1.5">
                <Scan className="w-3.5 h-3.5 text-orange-400" />
                Algorithmic Anomaly Detectors ({moduleList.length} Passes)
              </h4>
              <div className="space-y-2.5">
                {moduleList.map((mod) => (
                  <div
                    key={mod.id}
                    className="p-3 sm:p-3.5 rounded-xl bg-[#0D0F16] border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            mod.score > 50 ? 'bg-red-400' : 'bg-emerald-400'
                          }`}
                        />
                        <span className="text-xs font-bold text-white truncate">{mod.name}</span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{mod.description}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="w-24 bg-[#181B26] h-1.5 rounded-full overflow-hidden">
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
                      <span
                        className={`text-xs font-mono font-bold w-10 text-right ${
                          mod.score > 50 ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        <AnimatedCounter value={mod.score} duration={1100} suffix="%" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

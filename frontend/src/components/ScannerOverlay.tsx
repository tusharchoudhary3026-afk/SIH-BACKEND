import React, { useState, useEffect } from 'react';
import { ShieldCheck, Cpu, Layers, Activity, Clock } from 'lucide-react';

interface ScannerOverlayProps {
  previewUrl: string | null;
  filename: string;
}

interface ScanStage {
  name: string;
  code: string;
  minTime: number;
}

const SCAN_STAGES: ScanStage[] = [
  { name: 'Pixel Normalization & EXIF Parsing', code: 'STAGE 01', minTime: 0 },
  { name: 'Quantization Matrix & Error Level Analysis (ELA)', code: 'STAGE 02', minTime: 2.2 },
  { name: '2D FFT Discrete Fourier Spectral Transform', code: 'STAGE 03', minTime: 4.8 },
  { name: 'Sensor PRNU & Noise Variance Decomposition', code: 'STAGE 04', minTime: 8.0 },
  { name: 'Multi-Model Neural Inspection & Bayesian Synthesis', code: 'STAGE 05', minTime: 12.0 }
];

export const ScannerOverlay: React.FC<ScannerOverlayProps> = ({ previewUrl, filename }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // High-precision live scan elapsed timer
  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsedSeconds((Date.now() - startTime) / 1000);
    }, 50);

    return () => clearInterval(interval);
  }, []);

  // Compute current active forensic stage based on elapsed time
  const currentStageIndex = Math.min(
    SCAN_STAGES.length - 1,
    SCAN_STAGES.reduce((acc, stage, idx) => (elapsedSeconds >= stage.minTime ? idx : acc), 0)
  );
  const currentStage = SCAN_STAGES[currentStageIndex];

  // Formatted timer mm:ss.ms
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = Math.floor(elapsedSeconds % 60);
  const tenths = Math.floor((elapsedSeconds % 1) * 10);
  const formattedTimer = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}s`;

  return (
    <div className="w-full space-y-6">
      {/* Main Scanner Panel */}
      <div className="w-full bg-[#11141E] rounded-3xl p-5 sm:p-8 border border-orange-500/35 shadow-2xl shadow-orange-500/10 relative overflow-hidden">
        {/* Subtle Ambient Radial Lighting */}
        <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />

        {/* Scanner Header Bar with Live Elapsed Timer */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="w-3 h-3 rounded-full bg-orange-500 block animate-ping absolute inset-0 opacity-75" />
              <span className="w-3 h-3 rounded-full bg-orange-500 block relative shadow-[0_0_12px_rgba(249,115,22,0.8)]" />
            </div>
            <div>
              <span className="text-xs font-mono font-bold text-orange-400 uppercase tracking-widest block">
                Deep Forensic Pipeline In Progress
              </span>
              <span className="text-[11px] text-gray-400 font-mono">
                {filename}
              </span>
            </div>
          </div>

          {/* High-Tech Live Elapsed Time Counter */}
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-[#0B0D14] border border-orange-500/40 shadow-inner">
            <Clock className="w-4 h-4 text-orange-400 animate-spin" style={{ animationDuration: '4s' }} />
            <div className="flex flex-col items-start">
              <span className="text-[9px] font-mono uppercase tracking-wider text-gray-400">
                Scan Compute Time
              </span>
              <span className="text-sm font-mono font-bold text-white tracking-wider text-shadow-[0_0_10px_rgba(249,115,22,0.5)]">
                {formattedTimer}
              </span>
            </div>
          </div>
        </div>

        {/* Image Scanner Viewport */}
        {previewUrl && (
          <div className="relative w-full aspect-video max-h-[460px] rounded-2xl overflow-hidden border-2 border-orange-500/40 bg-black select-none shadow-2xl">
            {/* The Target Image */}
            <img
              src={previewUrl}
              alt="Scanning target"
              className="w-full h-full object-contain opacity-85"
            />

            {/* Holographic scanning wash */}
            <div className="absolute inset-0 bg-gradient-to-b from-orange-500/10 via-transparent to-orange-500/15 pointer-events-none" />

            {/* Sweeping Laser Beam with high-intensity glowing head */}
            <div className="absolute inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-orange-400 to-transparent shadow-[0_0_25px_6px_rgba(249,115,22,0.8),0_0_80px_16px_rgba(249,115,22,0.3)] animate-scan-laser pointer-events-none" />

            {/* High-Tech Radar Cone Sweep */}
            <div
              className="absolute inset-0 pointer-events-none opacity-20 animate-spin"
              style={{
                animationDuration: '6s',
                background: 'conic-gradient(from 0deg at 50% 50%, rgba(249,115,22,0.4) 0deg, transparent 60deg, transparent 360deg)'
              }}
            />

            {/* Precision Grid Shimmer */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(249,115,22,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(249,115,22,0.07)_1px,transparent_1px)] bg-[size:28px_28px] pointer-events-none animate-grid-shimmer" />

            {/* Holographic Corner Target Brackets */}
            <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-orange-400 pointer-events-none animate-bracket-pulse">
              <span className="absolute top-1 left-1 text-[8px] font-mono text-orange-300">TL-01</span>
            </div>
            <div className="absolute top-3 right-3 w-8 h-8 border-t-2 border-r-2 border-orange-400 pointer-events-none animate-bracket-pulse" style={{ animationDelay: '0.5s' }}>
              <span className="absolute top-1 right-1 text-[8px] font-mono text-orange-300">TR-02</span>
            </div>
            <div className="absolute bottom-12 left-3 w-8 h-8 border-b-2 border-l-2 border-orange-400 pointer-events-none animate-bracket-pulse" style={{ animationDelay: '1s' }}>
              <span className="absolute bottom-1 left-1 text-[8px] font-mono text-orange-300">BL-03</span>
            </div>
            <div className="absolute bottom-12 right-3 w-8 h-8 border-b-2 border-r-2 border-orange-400 pointer-events-none animate-bracket-pulse" style={{ animationDelay: '1.5s' }}>
              <span className="absolute bottom-1 right-1 text-[8px] font-mono text-orange-300">BR-04</span>
            </div>

            {/* Central Targeting Reticle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-16 h-16 rounded-full border border-orange-400/30 border-dashed animate-spin" style={{ animationDuration: '10s' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-orange-400/50" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-orange-400 shadow-[0_0_12px_rgba(249,115,22,0.9)] animate-ping" />
            </div>

            {/* Bottom Telemetry Ticker Overlay */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-8 pb-3 px-4 pointer-events-none">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-2 text-orange-300">
                  <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                  <span className="font-bold uppercase tracking-wider">
                    {currentStage.code}: {currentStage.name}
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-3 text-gray-400">
                  <span>RES: MATRIX 1536²</span>
                  <span className="text-emerald-400 font-semibold">PASS {currentStageIndex + 1}/5</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Multi-Stage Forensic Timeline */}
        <div className="mt-6 space-y-3 relative z-10">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-gray-300 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
              <span>Analyzing Spectral & Spatial Frequencies...</span>
            </span>
            <span className="text-orange-400 font-bold">
              {Math.min(99, Math.floor(18 + currentStageIndex * 19 + (elapsedSeconds % 2.5) * 4))}%
            </span>
          </div>

          {/* Smooth Animated Progress Track */}
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-orange-600 via-amber-400 to-orange-500 rounded-full transition-all duration-300 shadow-[0_0_15px_rgba(249,115,22,0.6)]"
              style={{
                width: `${Math.min(99, Math.floor(18 + currentStageIndex * 19 + (elapsedSeconds % 2.5) * 4))}%`
              }}
            />
          </div>

          {/* Interactive Forensic Stage Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
            {SCAN_STAGES.map((stage, idx) => {
              const isPast = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              return (
                <div
                  key={stage.code}
                  className={`p-2.5 rounded-xl border transition-all text-left flex flex-col justify-between ${
                    isCurrent
                      ? 'bg-orange-500/15 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                      : isPast
                      ? 'bg-white/[0.03] border-white/10 opacity-70'
                      : 'bg-white/[0.01] border-white/5 opacity-40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold text-orange-400">{stage.code}</span>
                    {isPast ? (
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    ) : isCurrent ? (
                      <Cpu className="w-3 h-3 text-orange-400 animate-spin" style={{ animationDuration: '3s' }} />
                    ) : (
                      <Layers className="w-3 h-3 text-gray-500" />
                    )}
                  </div>
                  <span className="text-[10px] text-gray-200 line-clamp-1 leading-tight font-medium">
                    {stage.name.split(' ')[0]} {stage.name.split(' ')[1] || ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

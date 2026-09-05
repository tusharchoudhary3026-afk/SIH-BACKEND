export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence?: number;
}

export interface MetricBreakdown {
  spectralScore: string;
  noiseConsistency: string;
  metadataStatus: string;
  facialGlint: string;
}

export interface ForensicSignalItem {
  aiLikelihood?: number;
  status?: string;
  evidence?: Record<string, any>;
  [key: string]: any;
}

export interface ForensicSignals {
  score: number;
  metadata?: ForensicSignalItem;
  ela?: ForensicSignalItem;
  frequency?: ForensicSignalItem;
  noise?: ForensicSignalItem;
  synthId?: ForensicSignalItem & {
    c2pa?: ForensicSignalItem;
    pixel?: ForensicSignalItem;
  };
  prnu?: ForensicSignalItem;
  jpeg_ghost?: ForensicSignalItem;
  cfa_demosaic?: ForensicSignalItem;
}

export interface DetectResponse {
  success: boolean;
  taskId: string;
  verdict: 'AUTHENTIC IMAGE' | 'POSSIBLE AI-GENERATED IMAGE' | string;
  isAi: boolean;
  confidence: number; // 0 - 100
  regions: Region[];
  modelAttribution: string;
  synthIdStatus: 'PRESENT' | 'NOT_DETECTED' | 'INCONCLUSIVE' | string;
  explanation: {
    gemini: string;
    forensics: string;
  };
  metrics: MetricBreakdown;
  forensicSignals: ForensicSignals;
  heatmapUrl: string;
  scanMode: string;
  error?: string;
}

export interface UploadResponse {
  success: boolean;
  imageId: string;
  url: string;
  filename: string;
  filesize: string;
  format: string;
  error?: string;
}

export interface ScanHistoryItem {
  id: string;
  timestamp: string;
  filename: string;
  filesize: string;
  imageUrl: string;
  detectResult: DetectResponse;
}

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

export interface UnifiedVerdict {
  verdict: 'AUTHENTIC' | 'SUSPECTED AI GENERATION' | 'SUSPECTED DOCUMENT TAMPERING' | 'SCREEN RECAPTURE / PRESENTATION ATTACK' | 'INCONCLUSIVE' | string;
  aiProbability: number; // 0 - 100: actual probability of AI generation
  overallConfidence: number; // 0 - 100: confidence in the verdict (NOT AI probability)
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;
  primaryThreatType: 'AI_SYNTHESIS' | 'MANUAL_TAMPERING' | 'RECAPTURE_SPOOF' | 'NONE' | string;
  executiveSummary: string;
  detectedAnomalies: string[];
  layerCorrelations: string;
  recommendedAction: 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT' | string;
}

export interface LayerBResults {
  sdxlClassifier?: {
    aiProbability: number | null;
    modelName: string;
    rawOutput?: Array<{ label: string; score: number }>;
    error?: string;
  };
  liveness?: {
    verdict: string;
    livenessConsistencyScore: number;
    signals: {
      sharpnessScore: number;
      moireScore: number;
      colorDiversityScore: number;
    };
    reasons: string[];
  };
  documentForensics?: {
    elaScore: number;
    noiseInconsistencyScore: number;
    frequencyArtifactScore: number;
    copyMoveScore: number;
    riskScore: number;
    decision: string;
    reasonCodes: string[];
  };
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
  layerB?: LayerBResults;
  unifiedVerdict?: UnifiedVerdict;
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

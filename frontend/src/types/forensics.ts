import { UnifiedVerdict, LayerBResults } from './api';

export interface ForensicModuleResult {
  id: string;
  name: string;
  score: number; // 0 to 100
  status: string;
  description: string;
}

export interface MetadataSummary {
  c2paStatus: string;
  tamperAssessment: string;
  colorProfile: string;
  quantizationTable: string;
}

export interface AnalysisData {
  id: string;
  timestamp: string;
  filename: string;
  filesize: string;
  mimetype: string;
  verdict: 'Synthetic / Manipulated' | 'Likely Authentic' | string;
  overallProbability: number; // 0 - 100
  confidenceGrade: string;
  explanation?: string;
  modules: ForensicModuleResult[];
  metadataSummary: MetadataSummary;
  unifiedVerdict?: UnifiedVerdict;
  layerB?: LayerBResults;
}

export interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: AnalysisData;
}

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Key,
  Network
} from 'lucide-react';
import { AnalysisData } from '../types/forensics';
import { ApiService } from '../services/apiService';
import { UploadZone } from '../components/UploadZone';
import { ScannerOverlay } from '../components/ScannerOverlay';
import { ResultsDashboard } from '../components/ResultsDashboard';
import { ImageModal } from '../components/ImageModal';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];

export const Analyzer: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<AnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyIssue, setApiKeyIssue] = useState<string | null>(null);
  const [isImageEnlarged, setIsImageEnlarged] = useState<boolean>(false);
  const [barsLoaded, setBarsLoaded] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Trigger progress bar filling animation when results become available
  useEffect(() => {
    if (results) {
      setBarsLoaded(false);
      const timer = setTimeout(() => setBarsLoaded(true), 60);
      return () => clearTimeout(timer);
    }
  }, [results]);

  const handleFileUpload = async (selectedFile: File) => {
    if (!ALLOWED_TYPES.includes(selectedFile.type.toLowerCase())) {
      setError(`Unsupported format (${selectedFile.type || 'unknown'}). Please upload a JPEG, PNG, WebP, or TIFF image.`);
      return;
    }

    setError(null);
    setApiKeyIssue(null);
    setFile(selectedFile);
    setResults(null);

    // Revoke previous blob URL to prevent memory leak (BUG-10)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    setIsLoading(true);

    try {
      const uploadRes = await ApiService.uploadImage(selectedFile);
      if (!uploadRes.success || !uploadRes.imageId) {
        throw new Error(uploadRes.error || 'Upload failed');
      }

      const detectRes = await ApiService.detectImage(
        uploadRes.imageId,
        'deep_scan',
        85
      );

      if (!detectRes.success) {
        throw new Error(detectRes.error || 'Detection failed');
      }

      const overallScore = Math.round((detectRes.forensicSignals?.score || 0) * 100);

      const mappedData: AnalysisData = {
        id: detectRes.taskId || `FSC-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        filename: uploadRes.filename || selectedFile.name,
        filesize: uploadRes.filesize || 'Unknown',
        mimetype: selectedFile.type,
        verdict: detectRes.unifiedVerdict?.verdict
          ? (detectRes.unifiedVerdict.verdict.includes('AUTHENTIC') ? 'Likely Authentic' : detectRes.unifiedVerdict.verdict)
          : (detectRes.isAi ? 'Synthetic / Manipulated' : 'Likely Authentic'),
        overallProbability: detectRes.unifiedVerdict?.overallConfidence != null
          ? Math.round(detectRes.unifiedVerdict.overallConfidence)
          : overallScore,
        confidenceGrade: overallScore > 75 ? 'High Confidence' : overallScore > 50 ? 'Moderate Suspicion' : 'Verified Authentic',
        explanation: detectRes.unifiedVerdict?.executiveSummary || detectRes.explanation?.gemini || '',
        modules: [
          {
            id: 'gemini',
            name: 'Gemini Multi-Modal Vision Forensics',
            score: Math.round(detectRes.confidence || 0),
            status: '',
            description: detectRes.explanation?.gemini || 'Analyzes neural image semantics.'
          },
          ...(detectRes.layerB?.sdxlClassifier?.aiProbability != null ? [{
            id: 'sdxl',
            name: 'PyTorch SDXL Diffusion Classifier',
            score: Math.round(detectRes.layerB.sdxlClassifier.aiProbability * 100),
            status: '',
            description: `Deep-learning classifier (${detectRes.layerB.sdxlClassifier.modelName}) neural probability.`
          }] : []),
          ...(detectRes.layerB?.liveness ? [{
            id: 'liveness',
            name: 'Hardware Recapture & Moiré Liveness',
            score: Math.round(100 - detectRes.layerB.liveness.livenessConsistencyScore),
            status: detectRes.layerB.liveness.verdict,
            description: detectRes.layerB.liveness.reasons?.[0] || 'Inspects screen frequency patterns, sharpness, and color diversity.'
          }] : []),
          ...(detectRes.layerB?.documentForensics ? [{
            id: 'doc_forensics',
            name: 'Document Splicing & Forgery (Layer B)',
            score: Math.round(detectRes.layerB.documentForensics.riskScore),
            status: detectRes.layerB.documentForensics.decision,
            description: `Recompression & copy-move analysis (${detectRes.layerB.documentForensics.reasonCodes?.join(', ') || 'Normal'}).`
          }] : []),
          {
            id: 'ela',
            name: 'Error Level Analysis (ELA)',
            score: Math.round((detectRes.forensicSignals?.ela?.aiLikelihood || 0) * 100),
            status: '',
            description: 'Evaluates error rate disparities between resaved compression passes.'
          },
          {
            id: 'c2pa',
            name: 'Metadata & C2PA Provenance',
            score: Math.round((detectRes.forensicSignals?.synthId?.c2pa?.aiLikelihood || 0) * 100),
            status: '',
            description: 'Validates cryptographic Content Credentials (C2PA).'
          },
          {
            id: 'noise',
            name: 'Local Noise Consistency',
            score: Math.round((detectRes.forensicSignals?.noise?.aiLikelihood || 0) * 100),
            status: '',
            description: 'Assesses ISO sensor noise distribution across adjacent image patches.'
          }
        ],
        metadataSummary: {
          c2paStatus: detectRes.forensicSignals?.synthId?.c2pa?.evidence?.status || 'UNKNOWN',
          tamperAssessment: detectRes.forensicSignals?.metadata?.evidence?.status || 'UNKNOWN',
          colorProfile: 'sRGB IEC61966-2.1',
          quantizationTable: 'Standard Quantization Matrix'
        },
        unifiedVerdict: detectRes.unifiedVerdict,
        layerB: detectRes.layerB
      };

      setResults(mappedData);
    } catch (err: unknown) {
      console.error('Forensic analysis request failed:', err);
      const keyRelatedCodes = ['GEMINI_KEY_MISSING', 'GEMINI_KEY_INVALID', 'GEMINI_QUOTA_EXCEEDED', 'GEMINI_RATE_LIMITED', 'GEMINI_SERVICE_UNAVAILABLE'];
      const errorWithCode = err as { code?: string; message?: string };
      if (errorWithCode.code && keyRelatedCodes.includes(errorWithCode.code)) {
        setApiKeyIssue(errorWithCode.code);
      } else {
        setError(errorWithCode.message || 'An error occurred while connecting to the forensics engine.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetAnalysis = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setResults(null);
    setError(null);
    setApiKeyIssue(null);
    setBarsLoaded(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [previewUrl]);

  // Cleanup blob URL on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  return (
    <div className="bg-[#090A0E] min-h-screen flex flex-col items-center pt-10 sm:pt-16 pb-20 px-4 sm:px-6 md:px-8 text-gray-100 selection:bg-orange-600 selection:text-white">
      {/* Top Navigation Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-300 hover:text-white bg-[#151824] border border-white/10 px-4 py-2 rounded-full shadow-xl hover:border-white/20 transition-all duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Overview</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            to="/graph"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-300 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 px-3.5 py-1.5 rounded-full shadow-lg transition-all"
          >
            <Network className="w-3.5 h-3.5" />
            <span>Fraud Relationship Graph</span>
          </Link>
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-gray-400 hidden sm:inline">Engine Active</span>
        </div>
      </div>

      {/* Main Dashboard Container */}
      <main className="w-full max-w-5xl">
        {/* Header Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            AI Image Forensics & Deepfake Analyzer
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-2 max-w-xl mx-auto">
            Upload any image to execute multi-domain frequency analysis, ELA compression inspection, and C2PA provenance extraction.
          </p>
        </div>

        {/* Upload Zone */}
        {!results && !isLoading && (
          <UploadZone fileInputRef={fileInputRef} onFileSelect={handleFileUpload} />
        )}

        {/* Loading Scanner */}
        {isLoading && (
          <ScannerOverlay previewUrl={previewUrl} filename={file?.name || 'target.img'} />
        )}

        {/* API Key / Service Error */}
        {apiKeyIssue && (
          <div className="mt-6 p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center gap-4 text-amber-200">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
              <Key className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-bold tracking-tight text-amber-400 mb-0.5">Analysis Service Unavailable</h4>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                {apiKeyIssue === 'GEMINI_KEY_MISSING' && "The analysis service isn't configured yet (no API key set). This is a setup issue on our end, not your image."}
                {apiKeyIssue === 'GEMINI_KEY_INVALID' && "The analysis service's API key was rejected. Please contact the site owner."}
                {apiKeyIssue === 'GEMINI_QUOTA_EXCEEDED' && "The analysis service has used up its available quota for now. Please try again later."}
                {apiKeyIssue === 'GEMINI_RATE_LIMITED' && "Too many scans right now — please wait a moment and try again."}
                {apiKeyIssue === 'GEMINI_SERVICE_UNAVAILABLE' && "The AI model is currently experiencing unusually high demand. Spikes in demand are temporary. Please try again shortly."}
              </p>
            </div>
            <button
              onClick={() => { setApiKeyIssue(null); if (file) handleFileUpload(file); }}
              className="mt-3 sm:mt-0 whitespace-nowrap bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 px-4 py-2 rounded-xl text-xs font-semibold transition-colors border border-amber-500/20"
            >
              Try Again
            </button>
          </div>
        )}

        {/* General Error */}
        {error && !apiKeyIssue && (
          <div className="mt-6 p-4 rounded-2xl bg-red-950/40 border border-red-500/40 flex items-start gap-3 text-red-200">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-red-400">Analysis Failed</h4>
              <p className="text-xs text-red-300 mt-0.5">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-red-400 hover:text-red-300 underline font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Results Dashboard */}
        {results && !isLoading && (
          <ResultsDashboard
            results={results}
            previewUrl={previewUrl}
            barsLoaded={barsLoaded}
            onReset={resetAnalysis}
            onImageEnlarge={() => setIsImageEnlarged(true)}
          />
        )}
      </main>

      {/* Full-Screen Image Modal */}
      {isImageEnlarged && previewUrl && (
        <ImageModal previewUrl={previewUrl} onClose={() => setIsImageEnlarged(false)} />
      )}
    </div>
  );
};

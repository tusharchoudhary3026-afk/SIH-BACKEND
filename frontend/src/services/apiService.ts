import { UploadResponse, DetectResponse } from '../types/api';

declare global {
  interface Window {
    ENV_API_URL?: string;
  }
}

const MAX_RETRIES = 1; // Single retry for transient failures
const RETRY_DELAY_MS = 1000; // 1-second base delay for exponential backoff

/**
 * Typed API error with optional error code from the backend.
 */
class ApiError extends Error {
  public readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/**
 * Determines if an error is retryable (5xx or network errors).
 */
function isRetryable(status: number): boolean {
  return status >= 500 && status < 600;
}

/**
 * Waits for a given number of milliseconds.
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ApiService {
  public static getBaseUrl(): string {
    if (typeof window !== 'undefined' && window.ENV_API_URL) {
      return window.ENV_API_URL;
    }
    // Use empty string to leverage Vite's proxy in development
    return '';
  }

  public static async uploadImage(file: File): Promise<UploadResponse> {
    const baseUrl = this.getBaseUrl();
    const formData = new FormData();
    formData.append('file', file);

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${baseUrl}/api/v1/upload`, {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const errText = await response.text();
          if (attempt < MAX_RETRIES && isRetryable(response.status)) {
            lastError = new ApiError(`Upload failed (HTTP ${response.status}): ${errText}`);
            await delay(RETRY_DELAY_MS * Math.pow(2, attempt));
            continue;
          }
          throw new ApiError(`Upload failed (HTTP ${response.status}): ${errText}`);
        }

        return await response.json();
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          throw err;
        }

        const message = err instanceof Error ? err.message : 'Failed to connect to the backend server for upload.';

        // Retry on network errors
        if (attempt < MAX_RETRIES) {
          lastError = new ApiError(message);
          await delay(RETRY_DELAY_MS * Math.pow(2, attempt));
          continue;
        }

        console.error('[ApiService] Upload API failed:', err);
        throw new ApiError(message);
      }
    }

    throw lastError || new ApiError('Upload failed after retries.');
  }

  public static async detectImage(
    imageId: string,
    mode: string = 'deep_scan',
    sensitivity: number = 85
  ): Promise<DetectResponse> {
    const baseUrl = this.getBaseUrl();

    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Runs without timeout limit — continues until scan result is returned
        const response = await fetch(`${baseUrl}/api/v1/detect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageId, mode, sensitivity })
        });

        if (!response.ok) {
          let errorBody: { error?: string; code?: string };
          try {
            errorBody = await response.json();
          } catch {
            errorBody = { error: `Detection failed with HTTP ${response.status}`, code: 'UNKNOWN_ERROR' };
          }

          if (attempt < MAX_RETRIES && isRetryable(response.status)) {
            lastError = new ApiError(
              errorBody.error || `Detection failed with HTTP ${response.status}`,
              errorBody.code
            );
            await delay(RETRY_DELAY_MS * Math.pow(2, attempt));
            continue;
          }

          throw new ApiError(
            errorBody.error || `Detection failed with HTTP ${response.status}`,
            errorBody.code
          );
        }

        return await response.json();
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          throw err;
        }

        const message = err instanceof Error ? err.message : 'Failed to connect to the forensics engine for detection.';

        // Retry on network errors
        if (attempt < MAX_RETRIES) {
          lastError = new ApiError(message);
          await delay(RETRY_DELAY_MS * Math.pow(2, attempt));
          continue;
        }

        console.error('[ApiService] Detection API failed:', err);
        throw new ApiError(message);
      }
    }

    throw lastError || new ApiError('Detection failed after retries.');
  }
}

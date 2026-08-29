import { AnalysisResult } from "../types";

// All Gemini calls go through our own serverless functions (/api/*), so the
// API key stays on the server and is never exposed in the browser bundle.

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as any)?.error || `Request to ${path} failed (${res.status})`);
  }
  return data as T;
}

/**
 * Ask the server whether AI-powered features (voice input, screenshot analysis)
 * are available for this deployment. Defaults to `false` if the check fails.
 */
export async function fetchAiEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data?.aiEnabled;
  } catch {
    return false;
  }
}

/**
 * Transcribe a short spoken website address from recorded audio.
 * `base64Audio` is the raw base64 payload (no `data:` prefix).
 */
export async function transcribeSpokenUrl(base64Audio: string, mimeType: string): Promise<string> {
  const { text } = await postJson<{ text: string }>('/api/transcribe', {
    audioBase64: base64Audio,
    mimeType,
  });
  return (text || '').trim();
}

/** Analyze a screenshot. `imageUrl` is a `data:` URL. */
export async function analyzeScreenshot(imageUrl: string): Promise<AnalysisResult> {
  const commaIdx = imageUrl.indexOf(',');
  const imageBase64 = commaIdx >= 0 ? imageUrl.slice(commaIdx + 1) : imageUrl;
  const mimeMatch = /^data:([^;,]+)[;,]/.exec(imageUrl);
  return postJson<AnalysisResult>('/api/analyze', {
    imageBase64,
    mimeType: mimeMatch?.[1] || 'image/png',
  });
}

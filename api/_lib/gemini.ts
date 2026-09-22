// Server-side calls to the shared dashboard proxy. The proxy holds the real
// Gemini API key; this app never sees it. Only DASHBOARD_PROXY_URL and
// DASHBOARD_PROXY_SECRET (both server-side env vars) live here.

const MODEL = 'gemini-3-flash-preview';

// JSON Schema `type` enum values matching the Gemini REST API's Type enum
// (previously imported from `@google/genai`'s `Type`).
const SchemaType = {
  OBJECT: 'OBJECT',
  ARRAY: 'ARRAY',
  STRING: 'STRING',
  NUMBER: 'NUMBER',
} as const;

interface ProxyResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

async function callProxy(body: Record<string, unknown>): Promise<ProxyResponse> {
  const proxyUrl = process.env.DASHBOARD_PROXY_URL;
  const proxySecret = process.env.DASHBOARD_PROXY_SECRET;
  if (!proxyUrl || !proxySecret) {
    throw new Error(
      'AI features are unavailable: DASHBOARD_PROXY_URL / DASHBOARD_PROXY_SECRET are not set for this deployment.',
    );
  }

  const response = await fetch(`${proxyUrl}/api/proxy/web-snap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-secret': proxySecret,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Dashboard proxy request failed (${response.status}): ${detail}`);
  }

  return response.json();
}

function textFromResponse(data: ProxyResponse): string {
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

/**
 * Transcribe a short spoken website address from recorded audio.
 * Uses Gemini (via the dashboard proxy), so it does not depend on the browser's
 * online speech service (which is blocked in some Chromium builds, e.g. Brave).
 */
export async function transcribeSpokenUrl(base64Audio: string, mimeType: string): Promise<string> {
  const data = await callProxy({
    model: MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Audio } },
        {
          text:
            'The audio contains a person saying a website address. ' +
            'Return ONLY the address as a bare domain or URL, lowercase, no spaces, no surrounding quotes or punctuation. ' +
            'Convert spoken words like "dot", "slash", "dash" to the matching symbols. ' +
            'Example outputs: "snapchat.com", "www.google.com", "example.com/pricing". ' +
            'If you cannot make out an address, return an empty string.',
        },
      ],
    },
  });

  return textFromResponse(data).trim();
}

export interface AnalysisResult {
  summary: string;
  colors: string[];
  layoutType: string;
  uiScore: number;
  uxSuggestions: string[];
  techStackGuess: string[];
}

export async function analyzeScreenshot(
  base64Image: string,
  mimeType = 'image/png',
): Promise<AnalysisResult> {
  const data = await callProxy({
    model: MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        {
          text: "Analyze this website screenshot. Provide a summary, identify main colors (hex), layout type, UX/UI score (1-100), key UX improvement suggestions, and a guess of the tech stack used based on visual patterns.",
        },
      ],
    },
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          summary: { type: SchemaType.STRING },
          colors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          layoutType: { type: SchemaType.STRING },
          uiScore: { type: SchemaType.NUMBER },
          uxSuggestions: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          techStackGuess: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        },
        required: ['summary', 'colors', 'layoutType', 'uiScore', 'uxSuggestions', 'techStackGuess'],
      },
    },
  });

  return JSON.parse(textFromResponse(data) || '{}') as AnalysisResult;
}

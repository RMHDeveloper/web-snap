// Server-side Gemini calls. The API key lives only here (as an environment
// variable) and is never shipped to the browser.
import { GoogleGenAI, Type } from '@google/genai';

const MODEL = 'gemini-3-flash-preview';

/**
 * Transcribe a short spoken website address from recorded audio.
 * Uses Gemini directly, so it does not depend on the browser's online speech service
 * (which is blocked in some Chromium builds, e.g. Brave).
 */
export async function transcribeSpokenUrl(base64Audio: string, mimeType: string): Promise<string> {
  const response = await client().models.generateContent({
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

  return (response.text || '').trim();
}

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error('AI features are unavailable: GEMINI_API_KEY is not set for this deployment.');
  }
  return new GoogleGenAI({ apiKey });
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
  const response = await client().models.generateContent({
    model: MODEL,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        {
          text: "Analyze this website screenshot. Provide a summary, identify main colors (hex), layout type, UX/UI score (1-100), key UX improvement suggestions, and a guess of the tech stack used based on visual patterns.",
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          colors: { type: Type.ARRAY, items: { type: Type.STRING } },
          layoutType: { type: Type.STRING },
          uiScore: { type: Type.NUMBER },
          uxSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          techStackGuess: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['summary', 'colors', 'layoutType', 'uiScore', 'uxSuggestions', 'techStackGuess'],
      },
    },
  });

  return JSON.parse(response.text || '{}') as AnalysisResult;
}

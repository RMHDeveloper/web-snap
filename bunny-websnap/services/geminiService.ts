
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const API_KEY = process.env.API_KEY || process.env.GEMINI_API_KEY;

// Lazily create the client so a missing key doesn't crash the whole app at
// import time — the UI still loads, and only the AI features report the problem.
let _ai: GoogleGenAI | null = null;
function getAi(): GoogleGenAI {
  if (!API_KEY) {
    throw new Error(
      'AI features are unavailable: GEMINI_API_KEY is not set for this deployment.',
    );
  }
  if (!_ai) _ai = new GoogleGenAI({ apiKey: API_KEY });
  return _ai;
}

/** Whether AI-powered features (voice input, screenshot analysis) can run. */
export const aiEnabled = !!API_KEY;

/**
 * Transcribe a short spoken website address from recorded audio.
 * Uses Gemini directly, so it does not depend on the browser's online speech service
 * (which is blocked in some Chromium builds, e.g. Brave).
 */
export async function transcribeSpokenUrl(base64Audio: string, mimeType: string): Promise<string> {
  const response = await getAi().models.generateContent({
    model: 'gemini-3-flash-preview',
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

export async function analyzeScreenshot(imageUrl: string): Promise<AnalysisResult> {
  // Convert data URL to base64 parts
  const base64Data = imageUrl.split(',')[1];
  
  const response = await getAi().models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: 'image/png',
            data: base64Data,
          },
        },
        {
          text: "Analyze this website screenshot. Provide a summary, identify main colors (hex), layout type, UX/UI score (1-100), key UX improvement suggestions, and a guess of the tech stack used based on visual patterns.",
        }
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          colors: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING } 
          },
          layoutType: { type: Type.STRING },
          uiScore: { type: Type.NUMBER },
          uxSuggestions: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING } 
          },
          techStackGuess: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING } 
          },
        },
        required: ["summary", "colors", "layoutType", "uiScore", "uxSuggestions", "techStackGuess"]
      }
    }
  });

  const result = JSON.parse(response.text || '{}');
  return result as AnalysisResult;
}

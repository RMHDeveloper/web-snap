
import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function analyzeScreenshot(imageUrl: string): Promise<AnalysisResult> {
  // Convert data URL to base64 parts
  const base64Data = imageUrl.split(',')[1];
  
  const response = await ai.models.generateContent({
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

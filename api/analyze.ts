import { analyzeScreenshot } from './_lib/gemini';
import { readJsonBody, sendError, sendJson } from './_lib/http';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }
  try {
    const { imageBase64, mimeType } = await readJsonBody(req);
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      sendError(res, 400, 'imageBase64 (base64 string, no data: prefix) is required');
      return;
    }
    const result = await analyzeScreenshot(imageBase64, mimeType || 'image/png');
    sendJson(res, 200, result);
  } catch (err: any) {
    const message = err?.message || 'Analysis failed';
    sendError(res, /GEMINI_API_KEY/.test(message) ? 503 : 502, message);
  }
}

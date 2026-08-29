import { transcribeSpokenUrl } from './_lib/gemini';
import { readJsonBody, sendError, sendJson } from './_lib/http';

export default async function handler(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }
  try {
    const { audioBase64, mimeType } = await readJsonBody(req);
    if (!audioBase64 || typeof audioBase64 !== 'string') {
      sendError(res, 400, 'audioBase64 (base64 string, no data: prefix) is required');
      return;
    }
    const text = await transcribeSpokenUrl(audioBase64, mimeType || 'audio/wav');
    sendJson(res, 200, { text });
  } catch (err: any) {
    const message = err?.message || 'Transcription failed';
    sendError(res, /GEMINI_API_KEY/.test(message) ? 503 : 502, message);
  }
}
